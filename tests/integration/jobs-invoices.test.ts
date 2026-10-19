import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));
import { convertQuoteToJob, saveJob, readJob, listJobs, changeJobStatus } from '@/lib/jobs/service';
import { createInvoiceFromJob, saveDirectInvoice, issueInvoice, saveInvoice, voidInvoice, recordPayment, voidPayment, readInvoice, listInvoices } from '@/lib/invoices/service';
import { invoiceBalance } from '@/lib/invoices/totals';
import { saveQuote,transitionQuote } from '@/lib/quotes/service';
import { saveRequest } from '@/lib/requests/service';
import { resetFixtures, fixtures, asLocalUser, adminQuery } from '../helpers/database';
import { quoteCommand as meta, fixtureQuoteInput, approveFixtureQuote } from '../helpers/quotes';
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
