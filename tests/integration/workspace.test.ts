import { beforeEach,describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/verify-user',()=>({verifyRequestUser:vi.fn()}));
import { resetFixtures,asLocalUser,adminQuery,fixtures } from '@/tests/helpers/database';
import { getCompanySettings,saveCompanySettings } from '@/lib/settings/service';
import { getHomeSummary } from '@/lib/home/service';
import { randomUUID } from 'node:crypto';
import { getCustomerDocument } from '@/lib/documents/service';
import { approveFixtureQuote,fixtureQuoteInput } from '@/tests/helpers/quotes';
import { getQuoteEditor,saveQuote } from '@/lib/quotes/service';
const meta=(version:number)=>({expectedVersion:version,idempotencyKey:randomUUID()});
describe('workspace settings and role-aware Home',()=>{
  beforeEach(resetFixtures);
  it('updates company document details, refuses stale versions and blocks supervisor direct SQL updates',async()=>{
    await asLocalUser(fixtures.pbcAdmin,async()=>{
      const current=await getCompanySettings();
      const result=await saveCompanySettings({...current.data,abn:'Sample ABN for test',bankDetails:'Sample bank details'},meta(current.version));expect(result.ok).toBe(true);
      expect((await getCompanySettings()).data.bankDetails).toBe('Sample bank details');
      const stale=await saveCompanySettings(current.data,meta(current.version));expect(stale).toMatchObject({ok:false,error:{code:'VERSION_CONFLICT'}});
    });
    const {withEmsTransaction}=await import('@/lib/db/transaction');
    const changed=await asLocalUser(fixtures.pbcSupervisor,()=>withEmsTransaction(tx=>tx.query('update ems.organizations set settings=$1 where id=$2 returning id',[{abn:'Spoof'},fixtures.pbcOrganizationId])));expect(changed).toHaveLength(0);
    const rows=await adminQuery<{settings:{abn:string}}>('select settings from ems.organizations where id=$1',[fixtures.pbcOrganizationId]);expect(rows[0].settings.abn).toBe('Sample ABN for test');
  });
  it('Home keeps supervisor finance out and assigned work scoped',async()=>{
    const supervisor=await asLocalUser(fixtures.pbcSupervisor,()=>getHomeSummary());
    expect(supervisor.finance).toBeNull();
    expect(supervisor.upcoming.some(v=>v.id===fixtures.pbcVisitId)).toBe(true);
    expect(JSON.stringify(supervisor)).not.toContain('Sample unassigned job');
    const admin=await asLocalUser(fixtures.pbcAdmin,()=>getHomeSummary());expect(admin.finance).not.toBeNull();
  });
  it('prints the original approved title and expiry after a new quote draft changes them',async()=>{
    const approved=await approveFixtureQuote();
    await asLocalUser(fixtures.pbcAdmin,async()=>{
      const before=(await getQuoteEditor(approved.id))!;
      await saveQuote({...fixtureQuoteInput(),id:approved.id,title:'Changed draft title',validUntil:'2027-01-01'},meta(before.version));
      const original=(await getCustomerDocument('quote',approved.id,before.revision.id))!;
      expect(original.title).toBe('Local test repaint');expect(original.dueDate).toBeNull();
      expect(JSON.stringify(original)).not.toMatch(/Internal only|actualPrice|engineVersion|materials|source|clientId/);
      const other=await getCustomerDocument('quote',fixtures.pbcJobId,before.revision.id);expect(other).toBeNull();
    });
  });
});
