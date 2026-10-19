import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));
import { convertQuoteToJob, saveJob, readJob, listJobs, changeJobStatus } from '@/lib/jobs/service';
import { createInvoiceFromJob, saveDirectInvoice, issueInvoice, saveInvoice, voidInvoice, recordPayment, voidPayment, readInvoice, listInvoices, readInvoicePipeline, type InvoiceTabKey } from '@/lib/invoices/service';
import { withEmsTransaction } from '@/lib/db/transaction';
import { sydneyToday } from '@/lib/domain/format';
import { WorkflowError } from '@/lib/workflows/commands';
import { invoiceBalance } from '@/lib/invoices/totals';
import { saveQuote,transitionQuote } from '@/lib/quotes/service';
import { saveRequest } from '@/lib/requests/service';
import { resetFixtures, fixtures, asLocalUser, adminQuery } from '../helpers/database';
import { quoteCommand as meta, fixtureQuoteInput, approveFixtureQuote } from '../helpers/quotes';
import { archiveJob, readJobPipeline, type JobCounts } from '@/lib/jobs/service';
const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);
const must = <T>(result: {ok:true;data:T}|{ok:false;error:{message:string}}):T => { if (!result.ok) throw Error(result.error.message); return result.data; };
const direct = () => ({ clientId:fixtures.pbcClientId, propertyId:fixtures.pbcPropertyId, title:'Direct repaint', description:'Walls and trim', publicLines:fixtureQuoteInput().publicLines, terms:'Fixed terms' });
describe.sequential('jobs, frozen contracts and invoice receipts', () => {
  beforeAll(async () => { await resetFixtures(); },60_000);
  it('balances exact decimal payments, ignoring cancelled receipts', () => {
    expect(invoiceBalance({total:'0.30'},[{amount:'0.10'},{amount:'0.20',voidedAt:'2026-01-01'}])).toBe('0.20');
  });
  it('converts one approved revision once across simultaneous requests and preserves snapshots', async () => {
    const quote=await approveFixtureQuote();
    await admin(async () => {
      const command=meta(3);
      const results=await Promise.all([convertQuoteToJob(quote.id,command),convertQuoteToJob(quote.id,command),convertQuoteToJob(quote.id,meta(3))]);
      expect(results.every(r=>r.ok)).toBe(true);
      expect(new Set(results.map(r=>must(r).id)).size).toBe(1);
      const job=must(results[0]); const before=(await readJob(job.id))!;
      await adminQuery("update ems.clients set billing_address='Changed billing' where id=$1",[fixtures.pbcClientId]);
      await adminQuery("update ems.properties set address='Changed site' where id=$1",[fixtures.pbcPropertyId]);
      await adminQuery("update ems.organizations set settings='{\"bankDetails\":\"Changed bank\"}' where id=$1",[fixtures.pbcOrganizationId]);
      const invoice=must(await createInvoiceFromJob(job.id,meta(job.version)));
      const after=(await readInvoice(invoice.id))!;
      expect(after.snapshot).toEqual(before.contract!.snapshot); expect(after.customer).toEqual(before.contract!.customer); expect(after.total).toBe(quote.total);
      expect(await adminQuery('select id from ems.invoice_lines where invoice_id=$1',[invoice.id])).toHaveLength(1);
    });
  });
  it('creates a direct fixed contract, serializes edits and blocks duplicate full invoices',async()=>admin(async()=>{
    const command=meta(); const input=direct(); const job=must(await saveJob(input,command));
    expect(await saveJob(input,command)).toEqual({ok:true,data:job});
    expect(await saveJob({...input,title:'Different'},command)).toMatchObject({ok:false,error:{code:'COMMAND_CONFLICT'}});
    const results=await Promise.all([saveJob({...input,id:job.id,title:'A'},meta(1)),saveJob({...input,id:job.id,title:'B'},meta(1))]);
    expect(results.filter(r=>r.ok)).toHaveLength(1); expect(results.find(r=>!r.ok)).toMatchObject({error:{code:'VERSION_CONFLICT'}});
    const invoices=await Promise.all([createInvoiceFromJob(job.id,meta(2)),createInvoiceFromJob(job.id,meta(2))]);
    expect(invoices.filter(r=>r.ok)).toHaveLength(1); expect(invoices.find(r=>!r.ok)).toMatchObject({error:{code:'ALREADY_INVOICED'}});
  }));
  it('issues, partially collects, completes, cancels receipts and voids with history',async()=>admin(async()=>{
    const job=must(await saveJob(direct(),meta())); const invoice=must(await createInvoiceFromJob(job.id,meta(1)));
    expect(await recordPayment({invoiceId:invoice.id,amount:'1',receivedOn:'2026-01-01',method:'cash'},meta(1))).toMatchObject({ok:false,error:{code:'INVALID_STATUS'}});
    must(await saveInvoice({id:invoice.id,issuedOn:'2026-01-01',dueOn:'2026-01-02'},meta(1)));
    must(await issueInvoice(invoice.id,meta(2)));
    const payment=must(await recordPayment({invoiceId:invoice.id,amount:'100.10',receivedOn:'2026-01-02',method:'bank_transfer',reference:'Actual receipt'},meta(3)));
    expect((await readInvoice(invoice.id))!.balance).toBe('999.90');
    expect((await listInvoices({status:'overdue'})).items.some(i=>i.id===invoice.id)).toBe(true);
    expect(await recordPayment({invoiceId:invoice.id,amount:'1000',receivedOn:'2026-01-02',method:'cash'},meta(4))).toMatchObject({ok:false,error:{code:'OVERPAYMENT'}});
    must(await recordPayment({invoiceId:invoice.id,amount:'999.90',receivedOn:'2026-01-03',method:'cash'},meta(4)));
    expect((await readInvoice(invoice.id))!.paymentStatus).toBe('paid');
    expect(await voidInvoice(invoice.id,meta(5))).toMatchObject({ok:false,error:{code:'ACTIVE_PAYMENTS'}});
    must(await voidPayment(payment.id,meta(5)));
    const detail=(await readInvoice(invoice.id))!; expect(detail.balance).toBe('100.10');
    const remaining=detail.payments.find(p=>!p.voidedAt)!; must(await voidPayment(remaining.id,meta(6)));
    must(await voidInvoice(invoice.id,meta(7)));
    expect((await readInvoice(invoice.id))!.payments).toHaveLength(2);
    expect((await createInvoiceFromJob(job.id,meta(1))).ok).toBe(true);
  }));
  it('rejects invalid and foreign identities atomically and denies finance to supervisors',async()=>{
    await admin(async()=>{
      expect(await saveJob({...direct(),clientId:fixtures.otherClientId},meta())).toMatchObject({ok:false,error:{code:'INVALID_CLIENT'}});
      expect(await saveJob({...direct(),publicLines:[]},meta())).toMatchObject({ok:false,error:{code:'VALIDATION'}});
      const pending=must(await saveQuote(fixtureQuoteInput(),meta()));
      expect(await convertQuoteToJob(pending.id,meta(1))).toMatchObject({ok:false,error:{code:'NOT_APPROVED'}});
    });
    await asLocalUser(fixtures.pbcSupervisor,async()=>{
      const job=(await readJob(fixtures.pbcJobId))!;
      expect(job).not.toHaveProperty('contract'); expect(JSON.stringify(job)).not.toMatch(/subtotal|unitPrice|bankDetails/);
      expect(await readJob(fixtures.unassignedJobId)).toBeNull();
      expect((await listJobs()).items.every(j=>!('total' in j))).toBe(true);
      expect(await saveJob(direct(),meta())).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});
      await expect(readInvoice(fixtures.pbcJobId)).rejects.toThrow('Administrator');
      const status=must(await changeJobStatus(job.id,'completed',meta(job.version))); expect(status.version).toBe(job.version+1);
      expect((await adminQuery<{completed_at:string|null}>('select completed_at from ems.jobs where id=$1',[job.id]))[0].completed_at).not.toBeNull();
    });
  });
  it('serializes concurrent receipts, retries without duplication and retains void audit',async()=>admin(async()=>{
    const job=must(await saveJob(direct(),meta()));const invoice=must(await createInvoiceFromJob(job.id,meta(1)));must(await issueInvoice(invoice.id,meta(1)));
    const input={invoiceId:invoice.id,amount:'100',receivedOn:'2026-01-02',method:'cash'};const command=meta(2);
    const payments=await Promise.all([recordPayment(input,command),recordPayment(input,command)]);
    expect(payments[0]).toEqual(payments[1]);expect((await readInvoice(invoice.id))!.payments).toHaveLength(1);
    expect(await recordPayment({...input,amount:'101'},command)).toMatchObject({ok:false,error:{code:'COMMAND_CONFLICT'}});
    const race=await Promise.all([recordPayment({...input,amount:'1000'},meta(3)),recordPayment({...input,amount:'1000'},meta(3))]);
    expect(race.filter(r=>r.ok)).toHaveLength(1);expect(race.find(r=>!r.ok)).toMatchObject({error:{code:'VERSION_CONFLICT'}});
    const payment=must(payments[0]);const voidCommand=meta(4);const cancellation=must(await voidPayment(payment.id,voidCommand));expect(await voidPayment(payment.id,voidCommand)).toEqual({ok:true,data:cancellation});
    expect(await adminQuery("select id from ems.activity_events where entity_id=$1 and action='payment_voided'",[invoice.id])).toHaveLength(1);
  }));
  it('uses the approved revision customer and site when a new draft changes the parent quote',async()=>{
    const quote=await approveFixtureQuote();await admin(async()=>{
      const [client]=await adminQuery<{id:string}>('insert into ems.clients(organization_id,display_name) values($1,\'New draft customer\') returning id',[fixtures.pbcOrganizationId]);
      const [site]=await adminQuery<{id:string}>('insert into ems.properties(organization_id,client_id,label,address) values($1,$2,\'New draft site\',\'New draft address\') returning id',[fixtures.pbcOrganizationId,client.id]);
      must(await saveQuote({...fixtureQuoteInput(),id:quote.id,clientId:client.id,propertyId:site.id,title:'New draft title'},meta(3)));
      const job=must(await convertQuoteToJob(quote.id,meta(4)));const detail=(await readJob(job.id))!;
      expect(detail.clientId).toBe(fixtures.pbcClientId);expect(detail.propertyId).toBe(fixtures.pbcPropertyId);expect(detail.title).toBe(fixtureQuoteInput().title);
      const invoice=must(await createInvoiceFromJob(job.id,meta(1)));expect((await readInvoice(invoice.id))!.clientId).toBe(fixtures.pbcClientId);
    });
  });
  it('creates and edits direct invoice drafts, freezes issued contents and rejects forged sites',async()=>admin(async()=>{
    const input={clientId:fixtures.pbcClientId,propertyId:fixtures.pbcPropertyId,title:'Direct invoice',publicLines:fixtureQuoteInput().publicLines,terms:'Direct terms',issuedOn:'2026-01-01',dueOn:'2026-01-10'};
    const command=meta();const invoice=must(await saveDirectInvoice(input,command));expect(await saveDirectInvoice(input,command)).toEqual({ok:true,data:invoice});
    expect((await readInvoice(invoice.id))!.jobId).toBeNull();
    must(await saveDirectInvoice({...input,id:invoice.id,title:'Edited direct draft'},meta(1)));
    must(await issueInvoice(invoice.id,meta(2)));const before=(await readInvoice(invoice.id))!;
    expect(await saveDirectInvoice({...input,id:invoice.id,title:'Forbidden issued edit'},meta(3))).toMatchObject({ok:false,error:{code:'INVALID_STATUS'}});
    await adminQuery("update ems.clients set display_name='Changed after direct issue' where id=$1",[fixtures.pbcClientId]);
    const after=(await readInvoice(invoice.id))!;expect(after.snapshot).toEqual(before.snapshot);expect(after.customer).toEqual(before.customer);expect(after.total).toBe('1100.00');
    const [foreignSite]=await adminQuery<{id:string}>('insert into ems.properties(organization_id,client_id,label,address) values($1,$2,\'Other site\',\'Other address\') returning id',[fixtures.otherOrganizationId,fixtures.otherClientId]);
    expect(await saveDirectInvoice({...input,propertyId:foreignSite.id},meta())).toMatchObject({ok:false,error:{code:'INVALID_PROPERTY'}});
  }));
  it('matches active work, invoice-ready and outstanding dashboard filters',async()=>admin(async()=>{
    const job=must(await saveJob({...direct(),status:'completed'},meta()));
    expect((await listJobs({status:'active'})).items.some(j=>j.id===job.id)).toBe(false);
    expect((await listJobs({status:'requires_invoicing'})).items.some(j=>j.id===job.id)).toBe(true);
    const invoice=must(await createInvoiceFromJob(job.id,meta(1)));
    expect((await listJobs({status:'requires_invoicing'})).items.some(j=>j.id===job.id)).toBe(false);
    must(await issueInvoice(invoice.id,meta(1)));
    must(await recordPayment({invoiceId:invoice.id,amount:'100',receivedOn:'2026-01-02',method:'cash'},meta(2)));
    expect((await listInvoices({status:'outstanding'})).items.some(i=>i.id===invoice.id)).toBe(true);
    must(await recordPayment({invoiceId:invoice.id,amount:'1000',receivedOn:'2026-01-03',method:'cash'},meta(3)));
    expect((await listInvoices({status:'outstanding'})).items.some(i=>i.id===invoice.id)).toBe(false);
  }));
  it('summarizes actual job costs and worked time with supervisor-only personal totals',async()=>{
    const job=await admin(async()=>must(await saveJob(direct(),meta())));
    const [visit]=await adminQuery<{id:string}>('insert into ems.visits(organization_id,job_id,title,all_day,start_date,end_date) values($1,$2,\'Actuals assignment\',true,\'2026-01-01\',\'2026-01-01\') returning id',[fixtures.pbcOrganizationId,job.id]);
    await adminQuery('insert into ems.visit_assignments(organization_id,visit_id,user_id) values($1,$2,$3)',[fixtures.pbcOrganizationId,visit.id,fixtures.pbcSupervisor]);
    for(const [user,amount,archived] of [[fixtures.pbcSupervisor,'0.10',false],[fixtures.pbcSupervisor,'0.20',false],[fixtures.pbcAdmin,'10.01',false],[fixtures.pbcSupervisor,'999.99',true]] as const){
      await adminQuery('insert into ems.expenses(organization_id,user_id,job_id,title,category,amount,occurred_on,archived_at) values($1,$2,$3,\'Actuals expense\',\'materials\',$4,\'2026-01-01\',case when $5 then now() else null end)',[fixtures.pbcOrganizationId,user,job.id,amount,archived]);
    }
    for(const [user,start,end,breakMinutes,jobId] of [[fixtures.pbcSupervisor,'2026-01-01T00:00:00Z','2026-01-01T01:30:00Z',15,job.id],[fixtures.pbcAdmin,'2026-01-02T00:00:00Z','2026-01-02T02:00:00Z',30,job.id],[fixtures.pbcAdmin,'2026-01-03T00:00:00Z','2026-01-03T05:00:00Z',0,fixtures.pbcJobId],[fixtures.pbcSupervisor,'2026-01-05T00:00:00Z',null,0,job.id],[fixtures.pbcAdmin,'2026-01-06T00:00:00Z',null,0,job.id]] as const){
      await adminQuery('insert into ems.time_entries(organization_id,user_id,job_id,started_at,ended_at,break_minutes) values($1,$2,$3,$4,$5,$6)',[fixtures.pbcOrganizationId,user,jobId,start,end,breakMinutes]);
    }
    const full=await admin(()=>readJob(job.id));
    expect(full!.actuals).toEqual({scope:'job',expenseTotal:'10.31',workedMinutes:'165',runningTimers:2});
    const personal=await asLocalUser(fixtures.pbcSupervisor,()=>readJob(job.id));
    expect(personal!.actuals).toEqual({scope:'own',expenseTotal:'0.30',workedMinutes:'75',runningTimers:1});
    expect(personal!.expenses).toHaveLength(2);expect(personal!.timeEntries).toHaveLength(2);
    expect(personal).not.toHaveProperty('contract');expect(personal).not.toHaveProperty('invoices');expect(JSON.stringify(personal)).not.toMatch(/unitPrice|subtotal|bankDetails/);
    expect((await admin(()=>readJob(fixtures.unassignedJobId)))!.actuals).toEqual({scope:'job',expenseTotal:'0.00',workedMinutes:'0',runningTimers:0});
  });
  it('links direct and converted jobs to the originating request and rejects mismatched requests',async()=>admin(async()=>{
    const request=must(await saveRequest({clientId:fixtures.pbcClientId,propertyId:fixtures.pbcPropertyId,title:'Request work',description:'Retain requested scope'},meta()));
    const job=must(await saveJob({...direct(),requestId:request.id},meta()));expect((await readJob(job.id))!.requestId).toBe(request.id);
    const [foreignRequest]=await adminQuery<{id:string}>('insert into ems.requests(organization_id,client_id,title) values($1,$2,\'Other request\') returning id',[fixtures.otherOrganizationId,fixtures.otherClientId]);
    expect(await saveJob({...direct(),requestId:foreignRequest.id},meta())).toMatchObject({ok:false,error:{code:'INVALID_REQUEST'}});
    const [otherClient]=await adminQuery<{id:string}>('insert into ems.clients(organization_id,display_name) values($1,\'Unrelated request customer\') returning id',[fixtures.pbcOrganizationId]);
    const [mismatch]=await adminQuery<{id:string}>('insert into ems.requests(organization_id,client_id,title) values($1,$2,\'Mismatched request\') returning id',[fixtures.pbcOrganizationId,otherClient.id]);
    expect(await saveJob({...direct(),requestId:mismatch.id},meta())).toMatchObject({ok:false,error:{code:'INVALID_REQUEST'}});
    expect(await saveJob({...direct(),id:job.id,requestId:mismatch.id},meta(1))).toMatchObject({ok:false,error:{code:'FIXED_CONTRACT'}});
    const quote=must(await saveQuote({...fixtureQuoteInput(),requestId:request.id},meta()));
    must(await transitionQuote(quote.id,'issued',meta(1)));must(await transitionQuote(quote.id,'approved',meta(2)));
    must(await saveQuote({...fixtureQuoteInput(),id:quote.id,clientId:otherClient.id,propertyId:null,requestId:mismatch.id,title:'New request draft'},meta(3)));
    const converted=must(await convertQuoteToJob(quote.id,meta(4)));expect((await readJob(converted.id))!.requestId).toBe(request.id);
  }));
});

describe.sequential('job counts, status transitions and pipeline', () => {
  beforeEach(async () => { await resetFixtures(); },60_000);
  const pipeline=()=>withEmsTransaction(tx=>readJobPipeline(tx));

  it('counts every tab independently of status and pagination while applying search and archive',async()=>admin(async()=>{
    for(const status of ['unscheduled','scheduled','in_progress','completed','cancelled']){
      must(await saveJob({...direct(),title:'T006 counts '+status,status},meta()));
    }
    const archived=must(await saveJob({...direct(),title:'T006 counts archived',status:'completed'},meta()));
    must(await archiveJob(archived.id,true,meta(archived.version)));
    const expected:JobCounts={all:5,active:3,unscheduled:1,scheduled:1,in_progress:1,completed:1,cancelled:1,requires_invoicing:1};
    for(const status of Object.keys(expected)){
      const list=await listJobs({search:'T006 counts',status});
      expect(list.counts).toEqual(expected);expect(list.total).toBe(expected[status as keyof JobCounts]);
      expect(list.items).toHaveLength(list.total);
      expect(list.items.every(item=>!('requires_invoicing' in item)&&!('updated_at' in item))).toBe(true);
    }
    const emptyPage=await listJobs({search:'T006 counts',status:'completed',page:2});
    expect(emptyPage.items).toEqual([]);expect(emptyPage.total).toBe(1);expect(emptyPage.counts).toEqual(expected);
    const searched=await listJobs({search:'T006 counts scheduled',status:'completed'});
    expect(searched.items).toEqual([]);expect(searched.counts).toEqual({all:1,active:1,unscheduled:0,scheduled:1,in_progress:0,completed:0,cancelled:0,requires_invoicing:0});
    expect((await listJobs({search:'T006 counts',archive:'all'})).counts).toEqual({...expected,all:6,completed:2});
    expect((await listJobs({search:'T006 counts',archive:'archived'})).counts).toEqual({all:1,active:0,unscheduled:0,scheduled:0,in_progress:0,completed:1,cancelled:0,requires_invoicing:0});
    expect((await listJobs({search:'T006 nonexistent'})).counts).toEqual({all:0,active:0,unscheduled:0,scheduled:0,in_progress:0,completed:0,cancelled:0,requires_invoicing:0});
  }));

  it('removes a completed job on draft creation and restores it after voiding the draft',async()=>admin(async()=>{
    const job=must(await saveJob({...direct(),title:'T006 invoice cycle',status:'completed'},meta()));
    const list=()=>listJobs({search:'T006 invoice cycle',status:'requires_invoicing'});
    expect((await list()).counts.requires_invoicing).toBe(1);
    expect((await pipeline()).requiresInvoicing).toEqual({count:1,amount:'1100.00',missingAmountCount:0});
    const invoice=must(await createInvoiceFromJob(job.id,meta(job.version)));
    expect((await list()).items).toEqual([]);expect((await list()).counts.requires_invoicing).toBe(0);
    expect((await pipeline()).requiresInvoicing).toEqual({count:0,amount:'0.00',missingAmountCount:0});
    must(await voidInvoice(invoice.id,meta(invoice.version)));
    expect((await list()).items.map(item=>item.id)).toEqual([job.id]);expect((await list()).counts.requires_invoicing).toBe(1);
    expect((await pipeline()).requiresInvoicing).toEqual({count:1,amount:'1100.00',missingAmountCount:0});
  }));

  it('sums contracts without dropping legacy completed jobs that lack a contract',async()=>admin(async()=>{
    must(await saveJob({...direct(),status:'in_progress'},meta()));
    must(await saveJob({...direct(),status:'completed'},meta()));
    must(await saveJob({...direct(),status:'cancelled'},meta()));
    const archived=must(await saveJob({...direct(),status:'completed'},meta()));
    must(await archiveJob(archived.id,true,meta(archived.version)));
    // Legacy jobs without contracts cannot be created by the current save service.
    await adminQuery("insert into ems.jobs(organization_id,client_id,title,status) values($1,$2,'T006 legacy missing amount','completed')",[fixtures.pbcOrganizationId,fixtures.pbcClientId]);
    expect(await pipeline()).toEqual({active:{count:3},inProgress:{count:1},requiresInvoicing:{count:2,amount:'1100.00',missingAmountCount:1}});
  }));

  it('omits supervisor financial keys and queries while counting only assigned jobs',async()=>{
    await admin(async()=>{
      const job=(await readJob(fixtures.pbcJobId))!;
      must(await changeJobStatus(job.id,'in_progress',meta(job.version)));
      must(await saveJob({...direct(),status:'completed'},meta()));
    });
    await asLocalUser(fixtures.pbcSupervisor,async()=>{
      const list=await listJobs({status:'completed'});
      expect(list.items).toEqual([]);expect(list.total).toBe(0);
      expect(list.counts).toEqual({all:1,active:1,unscheduled:0,scheduled:0,in_progress:1,completed:0,cancelled:0});
      expect(list.counts).not.toHaveProperty('requires_invoicing');
      await expect(listJobs({status:'requires_invoicing'})).rejects.toMatchObject({code:'FORBIDDEN'});
      await withEmsTransaction(async tx=>{
        const queries=vi.spyOn(tx,'query');
        expect(await readJobPipeline(tx)).toEqual({active:{count:1},inProgress:{count:1}});
        expect(queries.mock.calls).toHaveLength(1);
        expect(queries.mock.calls[0][0]).not.toMatch(/ems\.(job_contracts|invoices)/i);
      });
    });
  });

  it.each([
    {from:'completed',to:'in_progress',archived:false,allowed:false},
    {from:'scheduled',to:'cancelled',archived:false,allowed:false},
    {from:'scheduled',to:'completed',archived:true,allowed:false},
    {from:'scheduled',to:'completed',archived:false,allowed:true},
  ])('supervisor $from → $to archived=$archived allowed=$allowed',async({from,to,archived,allowed})=>{
    let job=await admin(()=>changeJobStatus(fixtures.pbcJobId,from,meta(1))).then(must);
    if(archived)job=await admin(()=>archiveJob(job.id,true,meta(job.version))).then(must);
    await asLocalUser(fixtures.pbcSupervisor,async()=>{
      const before=(await readJob(job.id))!;
      const result=await changeJobStatus(job.id,to,meta(job.version));
      if(allowed){
        expect(result).toMatchObject({ok:true,data:{id:job.id,version:job.version+1}});
        expect(await readJob(job.id)).toMatchObject({status:to});
      }else{
        expect(result).toMatchObject({ok:false,error:{code:'INVALID_TRANSITION',message:expect.stringMatching(/\S/)}});
        expect(await readJob(job.id)).toMatchObject({status:before.status,version:before.version});
      }
    });
  });

  it('treats same-status requests as no-ops even on archived jobs',async()=>{
    const job=await admin(()=>archiveJob(fixtures.pbcJobId,true,meta(1))).then(must);
    await asLocalUser(fixtures.pbcSupervisor,async()=>{
      const before=(await readJob(job.id))!;
      expect(await changeJobStatus(job.id,before.status,meta(job.version))).toEqual({ok:true,data:job});
    });
  });

  it('preserves admin reopening through both status commands and the edit path',async()=>admin(async()=>{
    const job=must(await saveJob({...direct(),status:'completed'},meta()));
    const reopened=must(await changeJobStatus(job.id,'in_progress',meta(job.version)));
    const archived=must(await archiveJob(job.id,true,meta(reopened.version)));
    const saved=must(await saveJob({...direct(),id:job.id,status:'scheduled'},meta(archived.version)));
    expect(await readJob(saved.id)).toMatchObject({status:'scheduled',version:saved.version,archivedAt:expect.any(String)});
  }));
});

describe.sequential('invoice tab counts, collectible balances and pipeline', () => {
  beforeEach(async () => { await resetFixtures(); },60_000);
  const input = (title:string,dueOn='2026-01-10',amount='100.00') => ({
    clientId:fixtures.pbcClientId,title,issuedOn:'2026-01-01',dueOn,
    publicLines:[{id:'service',kind:'line_item',name:'Painting service',description:'Walls',quantity:'1',unitPrice:amount,taxable:false,clientVisible:true}],
  });
  const pipeline = (today=sydneyToday()) => withEmsTransaction(tx=>readInvoicePipeline(tx,today));

  it('collects only active receipts after cancelling one of multiple payments',async()=>admin(async()=>{
    const invoice=must(await saveDirectInvoice(input('T003 receipt cancellation'),meta()));
    expect(await pipeline()).toEqual({draft:{count:1},outstanding:{count:0,amount:'0.00'},overdue:{count:0,amount:'0.00'}});
    must(await issueInvoice(invoice.id,meta(1)));
    must(await recordPayment({invoiceId:invoice.id,amount:'30.00',receivedOn:'2026-01-02',method:'cash'},meta(2)));
    const cancelled=must(await recordPayment({invoiceId:invoice.id,amount:'20.00',receivedOn:'2026-01-03',method:'cash'},meta(3)));
    expect((await readInvoice(invoice.id))!.balance).toBe('50.00');
    must(await voidPayment(cancelled.id,meta(4)));
    const expected={total:'100.00',balance:'70.00',paid:'30.00',paymentStatus:'partial',overdue:true};
    expect(await readInvoice(invoice.id)).toMatchObject(expected);
    expect((await listInvoices({status:'outstanding'})).items).toEqual([expect.objectContaining({id:invoice.id,...expected})]);
    expect(await pipeline('2026-01-11')).toEqual({draft:{count:0},outstanding:{count:1,amount:'70.00'},overdue:{count:1,amount:'70.00'}});
  }));

  it('returns zero draft and void balances while preserving totals and receipt amounts',async()=>admin(async()=>{
    const draft=must(await saveDirectInvoice(input('T003 draft balance'),meta()));
    const invoice=must(await saveDirectInvoice(input('T003 void balance'),meta()));
    must(await issueInvoice(invoice.id,meta(1)));
    const payment=must(await recordPayment({invoiceId:invoice.id,amount:'30.00',receivedOn:'2026-01-02',method:'cash'},meta(2)));
    must(await voidPayment(payment.id,meta(3)));
    must(await voidInvoice(invoice.id,meta(4)));
    for(const [id,status] of [[draft.id,'draft'],[invoice.id,'void']]){
      const expected={total:'100.00',balance:'0.00',paid:'0.00',paymentStatus:status,overdue:false};
      expect(await readInvoice(id)).toMatchObject(expected);
      expect((await listInvoices({status})).items).toEqual([expect.objectContaining({id,...expected,paid:'0'})]);
    }
    expect((await readInvoice(invoice.id))!.payments).toHaveLength(1);
    expect((await listInvoices({status:'outstanding'})).items).toEqual([]);
    expect(await pipeline()).toEqual({draft:{count:1},outstanding:{count:0,amount:'0.00'},overdue:{count:0,amount:'0.00'}});
  }));

  it('counts all overlapping tabs independently of the selected status and applies search',async()=>admin(async()=>{
    const today=sydneyToday();
    const yesterdayDate=new Date(today+'T12:00:00Z');yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);
    const yesterday=yesterdayDate.toISOString().slice(0,10);
    for(const status of ['draft','unpaid','partial','paid','void','zero']){
      const invoice=must(await saveDirectInvoice(input('T003 counts '+status,status==='partial'?yesterday:today,status==='zero'?'0.00':'100.00'),meta()));
      if(status==='draft')continue;
      must(await issueInvoice(invoice.id,meta(1)));
      if(status==='partial'||status==='paid')must(await recordPayment({invoiceId:invoice.id,amount:status==='partial'?'30.00':'100.00',receivedOn:'2026-01-02',method:'cash'},meta(2)));
      if(status==='void')must(await voidInvoice(invoice.id,meta(2)));
    }
    const expectedCounts={all:6,draft:1,issued:4,outstanding:2,overdue:1,unpaid:1,partial:1,paid:2,void:1};
    for(const status of Object.keys(expectedCounts) as InvoiceTabKey[]){
      const list=await listInvoices({status});
      expect(list.counts).toEqual(expectedCounts);expect(list.total).toBe(expectedCounts[status]);expect(list.items).toHaveLength(expectedCounts[status]);
    }
    const searched=await listInvoices({status:'draft',search:'T003 counts partial'});
    expect(searched.items).toEqual([]);expect(searched.total).toBe(0);
    expect(searched.counts).toEqual({all:1,draft:0,issued:1,outstanding:1,overdue:1,unpaid:0,partial:1,paid:0,void:0});
    const secondPage=await listInvoices({page:2});expect(secondPage.items).toEqual([]);expect(secondPage.counts).toEqual(expectedCounts);
  }));

  it('excludes invoices due today from overdue and sums balances across invoices',async()=>admin(async()=>{
    const today=sydneyToday();
    const yesterdayDate=new Date(today+'T12:00:00Z');yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);
    const yesterday=yesterdayDate.toISOString().slice(0,10);
    const dueToday=must(await saveDirectInvoice(input('T003 due today',today),meta()));
    const pastDue=must(await saveDirectInvoice(input('T003 past due',yesterday),meta()));
    must(await issueInvoice(dueToday.id,meta(1)));must(await issueInvoice(pastDue.id,meta(1)));
    must(await recordPayment({invoiceId:pastDue.id,amount:'30.00',receivedOn:'2026-01-02',method:'cash'},meta(2)));
    expect(await pipeline(today)).toEqual({draft:{count:0},outstanding:{count:2,amount:'170.00'},overdue:{count:1,amount:'70.00'}});
    expect(await pipeline(yesterday)).toEqual({draft:{count:0},outstanding:{count:2,amount:'170.00'},overdue:{count:0,amount:'0.00'}});
    expect(await readInvoice(dueToday.id)).toMatchObject({overdue:false});
    expect(await readInvoice(pastDue.id)).toMatchObject({overdue:true});
    const list=await listInvoices({status:'overdue'});expect(list.items.map(i=>i.id)).toEqual([pastDue.id]);expect(list.counts.overdue).toBe(1);
  }));

  it('rejects supervisors with the workflow FORBIDDEN contract',async()=>{
    await asLocalUser(fixtures.pbcSupervisor,async()=>{
      await expect(pipeline()).rejects.toBeInstanceOf(WorkflowError);
      await expect(pipeline()).rejects.toMatchObject({code:'FORBIDDEN'});
    });
  });
});
