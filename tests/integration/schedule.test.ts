import {randomUUID} from 'node:crypto';
import {beforeAll,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));vi.mock('@/lib/auth/verify-user',()=>({verifyRequestUser:vi.fn()}));
import {saveVisit,readVisit,querySchedule,changeVisitStatus,scheduleOptions,unscheduledJobs} from '@/lib/schedule/service';
import {asLocalUser,fixtures,resetFixtures,adminQuery} from '../helpers/database';
const meta=(expectedVersion=0)=>({expectedVersion,idempotencyKey:randomUUID()});
const admin=<T>(work:()=>Promise<T>)=>asLocalUser(fixtures.pbcAdmin,work);
const input=(extra:Record<string,unknown>={})=>({title:'Schedule integration',type:'visit',allDay:false,startsAt:'2026-10-15T22:00:00Z',endsAt:'2026-10-15T23:00:00Z',assigneeIds:[fixtures.pbcSupervisor],...extra});
const must=<T>(r:{ok:true;data:T}|{ok:false;error:{message:string}}):T=>{if(!r.ok)throw Error(r.error.message);return r.data;};
describe.sequential('schedule business services',()=>{
  beforeAll(async()=>{await resetFixtures();},60_000);
  it('creates assigned visits, retries once and rejects changed retry payloads',()=>admin(async()=>{
    const command=meta();const d=input();const result=await saveVisit(d,command);const saved=must(result);
    expect(await saveVisit(d,command)).toEqual(result);
    expect(await saveVisit({...d,title:'Changed'},command)).toMatchObject({ok:false,error:{code:'COMMAND_CONFLICT'}});
    expect((await readVisit(saved.id))?.assignees.map(a=>a.id)).toEqual([fixtures.pbcSupervisor]);
  }));
  it('warns for same-person overlapping times, excludes adjoining/different-person/cancelled visits',()=>admin(async()=>{
    const different=must(await saveVisit(input({assigneeIds:[fixtures.pbcAdmin]}),meta()));expect(different.warnings).toHaveLength(0);
    const overlap=must(await saveVisit(input(),meta()));expect(overlap.warnings.some(w=>w.userId===fixtures.pbcSupervisor)).toBe(true);
    const adjoining=must(await saveVisit(input({startsAt:'2026-10-15T23:00:00Z',endsAt:'2026-10-16T00:00:00Z'}),meta()));expect(adjoining.warnings).toHaveLength(0);
    const cancelled=must(await saveVisit(input({status:'cancelled'}),meta()));expect(cancelled.warnings).toHaveLength(0);
    const allDay=must(await saveVisit(input({allDay:true,startsAt:null,endsAt:null,startDate:'2026-10-16',endDate:'2026-10-17'}),meta()));expect(allDay.warnings.length).toBeGreaterThan(0);
  }));
  it('queries inclusive all-day ranges, unassigned and worker filters without finance payloads',()=>admin(async()=>{
    const saved=must(await saveVisit(input({allDay:true,startsAt:null,endsAt:null,startDate:'2026-10-18',endDate:'2026-10-20',assigneeIds:[]}),meta()));
    expect((await querySchedule({from:'2026-10-20',to:'2026-10-20'},{unassigned:true})).some(v=>v.id===saved.id)).toBe(true);
    expect((await querySchedule({from:'2026-10-21',to:'2026-10-21'})).some(v=>v.id===saved.id)).toBe(false);
    const assigned=await querySchedule({from:'2026-10-16',to:'2026-10-16'},{workerId:fixtures.pbcSupervisor});expect(assigned.every(v=>v.assignees.some(a=>a.id===fixtures.pbcSupervisor))).toBe(true);
    expect(JSON.stringify(assigned)).not.toMatch(/subtotal|unitPrice|bankDetails/);
  }));
  it('moves visits without resetting in-progress or completed jobs and sets new work scheduled',()=>admin(async()=>{
    for(const status of ['in_progress','completed']){
      await adminQuery('update ems.jobs set status=$1 where id=$2',[status,fixtures.pbcJobId]);
      const saved=must(await saveVisit(input({jobId:fixtures.pbcJobId}),meta()));
      must(await saveVisit(input({id:saved.id,jobId:fixtures.pbcJobId,startsAt:'2026-10-16T22:00:00Z',endsAt:'2026-10-16T23:00:00Z'}),meta(1)));
      const [event]=await adminQuery<{data:{before:{startsAt:string;assigneeIds:string[]};after:{startsAt:string;assigneeIds:string[]}}}>("select data from ems.activity_events where entity_id=$1 and action='updated' order by created_at desc limit 1",[saved.id]);
      expect(new Date(event.data.before.startsAt).toISOString()).toBe('2026-10-15T22:00:00.000Z');
      expect(new Date(event.data.after.startsAt).toISOString()).toBe('2026-10-16T22:00:00.000Z');
      expect(event.data.before.assigneeIds).toEqual([fixtures.pbcSupervisor]);
      expect(event.data.after.assigneeIds).toEqual([fixtures.pbcSupervisor]);
      expect((await adminQuery<{status:string}>('select status from ems.jobs where id=$1',[fixtures.pbcJobId]))[0].status).toBe(status);
    }
    expect((await unscheduledJobs()).some(j=>j.id===fixtures.unassignedJobId)).toBe(true);
    must(await saveVisit(input({jobId:fixtures.unassignedJobId}),meta()));
    expect((await unscheduledJobs()).some(j=>j.id===fixtures.unassignedJobId)).toBe(false);
  }));
  it('rejects stale edits, invalid workers, foreign references and inconsistent linked work atomically',()=>admin(async()=>{
    const saved=must(await saveVisit(input(),meta()));must(await saveVisit(input({id:saved.id,title:'Winner'}),meta(1)));
    expect(await saveVisit(input({id:saved.id,title:'Stale'}),meta(1))).toMatchObject({ok:false,error:{code:'VERSION_CONFLICT'}});
    expect(await saveVisit(input({assigneeIds:[fixtures.otherCompanyAdmin]}),meta())).toMatchObject({ok:false,error:{code:'INVALID_WORKER'}});
    expect(await saveVisit(input({assigneeIds:[fixtures.inactiveUser]}),meta())).toMatchObject({ok:false,error:{code:'INVALID_WORKER'}});
    expect(await saveVisit(input({jobId:randomUUID()}),meta())).toMatchObject({ok:false,error:{code:'INVALID_JOB'}});
    expect(await saveVisit(input({requestId:randomUUID()}),meta())).toMatchObject({ok:false,error:{code:'INVALID_REQUEST'}});
  }));
  it('allows supervisor status only for their exact assigned visit and denies administrative changes',async()=>{
    const own=must(await admin(()=>saveVisit(input({jobId:fixtures.pbcJobId}),meta())));
    const hidden=must(await admin(()=>saveVisit(input({jobId:fixtures.pbcJobId,assigneeIds:[]}),meta())));
    await asLocalUser(fixtures.pbcSupervisor,async()=>{
      expect(await readVisit(hidden.id)).toBeNull();
      expect(await changeVisitStatus(own.id,'completed',meta(1))).toMatchObject({ok:true,data:{version:2}});
      expect(await changeVisitStatus(hidden.id,'completed',meta(1))).toMatchObject({ok:false,error:{code:'NOT_FOUND'}});
      expect(await saveVisit(input({id:own.id}),meta(2))).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});
      expect((await scheduleOptions()).jobs).toHaveLength(0);
      expect((await querySchedule({from:'2026-10-16',to:'2026-10-16'})).every(v=>v.assignees.some(a=>a.id===fixtures.pbcSupervisor))).toBe(true);
    });
  });
  it('serializes competing edits and preserves retained cancellation history',()=>admin(async()=>{
    const saved=must(await saveVisit(input(),meta()));
    const edits=await Promise.all([saveVisit(input({id:saved.id,title:'First'}),meta(1)),saveVisit(input({id:saved.id,title:'Second'}),meta(1))]);
    expect(edits.filter(r=>r.ok)).toHaveLength(1);
    must(await changeVisitStatus(saved.id,'cancelled',meta(2)));
    expect((await readVisit(saved.id))?.status).toBe('cancelled');
    expect((await querySchedule({from:'2026-10-16',to:'2026-10-16'})).some(v=>v.id===saved.id)).toBe(false);
    expect((await querySchedule({from:'2026-10-16',to:'2026-10-16'},{showCancelled:true})).some(v=>v.id===saved.id)).toBe(true);
  }));
});
