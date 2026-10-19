import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { assertJobTransition } from '@/lib/jobs/transitions';
import type { JobStatus } from '@/lib/jobs/schemas';

describe('job status transitions', () => {
  const statuses:JobStatus[]=['unscheduled','scheduled','in_progress','completed','cancelled'];
  const supervisorCases:[JobStatus,JobStatus,boolean][]=[
    ['unscheduled','unscheduled',true],['unscheduled','scheduled',false],
    ['unscheduled','in_progress',true],['unscheduled','completed',true],['unscheduled','cancelled',false],
    ['scheduled','unscheduled',false],['scheduled','scheduled',true],
    ['scheduled','in_progress',true],['scheduled','completed',true],['scheduled','cancelled',false],
    ['in_progress','unscheduled',false],['in_progress','scheduled',false],
    ['in_progress','in_progress',true],['in_progress','completed',true],['in_progress','cancelled',false],
    ['completed','unscheduled',false],['completed','scheduled',false],
    ['completed','in_progress',false],['completed','completed',true],['completed','cancelled',false],
    ['cancelled','unscheduled',false],['cancelled','scheduled',false],
    ['cancelled','in_progress',false],['cancelled','completed',false],['cancelled','cancelled',true],
  ];
  it.each(supervisorCases)('supervisor %s → %s allowed=%s', (from,to,allowed) => {
    const change=()=>assertJobTransition({role:'supervisor',from,to,archived:false});
    if(allowed)expect(change).not.toThrow();
    else expect(change).toThrowError(expect.objectContaining({name:'WorkflowError',code:'INVALID_TRANSITION',message:expect.stringMatching(/\S/)}));
  });
  it.each(statuses.flatMap(from=>statuses.map(to=>({from,to}))))('archived supervisor $from → $to allows only no-ops', ({from,to}) => {
    const change=()=>assertJobTransition({role:'supervisor',from,to,archived:true});
    if(from===to)expect(change).not.toThrow();
    else expect(change).toThrowError(expect.objectContaining({code:'INVALID_TRANSITION',message:expect.stringMatching(/archived/i)}));
  });
  it.each([false,true].flatMap(archived=>statuses.flatMap(from=>statuses.map(to=>({archived,from,to})))))('admin $from → $to archived=$archived is allowed', ({from,to,archived}) => {
    expect(()=>assertJobTransition({role:'admin',from,to,archived})).not.toThrow();
  });
});
