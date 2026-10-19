import type { Role } from '@/lib/domain/types';
import { WorkflowError } from '@/lib/workflows/commands';
import { jobStatusLabels, type JobStatus } from './schemas';

export function assertJobTransition({role,from,to,archived}:{role:Role;from:JobStatus;to:JobStatus;archived:boolean}):void {
  if(role==='admin'||from===to)return;
  if(archived)throw new WorkflowError('INVALID_TRANSITION','Supervisors cannot change an archived job. Ask an administrator to make this change.');
  if((from==='unscheduled'||from==='scheduled'||from==='in_progress')&&(to==='in_progress'||to==='completed'))return;
  throw new WorkflowError('INVALID_TRANSITION',`Supervisors cannot change a job from ${jobStatusLabels[from]} to ${jobStatusLabels[to]}. Ask an administrator to make this change.`);
}
