import type { Role } from '@/lib/domain/types';
import { WorkflowError } from '@/lib/workflows/commands';
import { visitStatuses } from './schemas';
import type { VisitStatus } from './types';

export function assertVisitTransition({role,from,to}:{role:Role;from:VisitStatus;to:VisitStatus}):void {
  if(role==='admin'||from===to)return;
  if((from==='scheduled'||from==='in_progress')&&(to==='in_progress'||to==='completed'))return;
  throw new WorkflowError('INVALID_TRANSITION',`Supervisors cannot change a visit from ${visitStatuses[from]} to ${visitStatuses[to]}. Ask an administrator to make this change.`);
}
