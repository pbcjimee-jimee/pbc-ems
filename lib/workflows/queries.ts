import 'server-only';
import { z } from 'zod';
import { withEmsTransaction, type EmsTx } from '@/lib/db/transaction';

const entitySchema = z.enum(['client', 'property', 'request', 'quote', 'job', 'invoice', 'visit', 'expense', 'time_entry']);
export type ActivityEntity = z.infer<typeof entitySchema>;
export type ActivityItem = {
  id: string; createdAt: string; actorName: string; entityType: string;
  entityId: string; action: string; summary: string;
};
const inputSchema = z.object({
  entityType: entitySchema, entityId: z.uuid(), includeRelated: z.boolean().default(false),
  limit: z.number().int().nonnegative().transform(value => Math.min(value, 50)).default(20),
});
type ActivityTarget = { entityType: string; entityId: string };

async function relatedTargets(tx: EmsTx, entityType: ActivityEntity, entityId: string): Promise<ActivityTarget[]> {
  let sql: string;
  switch (entityType) {
    case 'client':
      sql = `select 'property' as "entityType",id as "entityId" from ems.properties where organization_id=$1 and client_id=$2
        union select 'request',id from ems.requests where organization_id=$1 and client_id=$2
        union select 'quote',id from ems.quotes where organization_id=$1 and client_id=$2
        union select 'job',id from ems.jobs where organization_id=$1 and client_id=$2
        union select 'invoice',id from ems.invoices where organization_id=$1 and client_id=$2`;
      break;
    case 'request':
      // Older converted jobs may lack request_id; retain the approved revision's original request.
      sql = `with related_jobs as (
          select j.id from ems.jobs j where j.organization_id=$1 and (j.request_id=$2 or (
            j.request_id is null and exists (
              select 1 from ems.quote_revisions r
              join ems.quotes q on q.id=r.quote_id and q.organization_id=r.organization_id
              where r.organization_id=$1 and r.id=j.quote_revision_id
                and (case when r.snapshot->'source' ? 'requestId' then r.snapshot->'source'->>'requestId'
                  else q.request_id::text end)=$2::text
            )
          ))
        )
        select 'quote' as "entityType",id as "entityId" from ems.quotes where organization_id=$1 and request_id=$2
        union select 'job',id from related_jobs
        union select 'visit',id from ems.visits where organization_id=$1
          and (request_id=$2 or job_id in (select id from related_jobs))`;
      break;
    case 'job':
      sql = `select 'visit' as "entityType",id as "entityId" from ems.visits where organization_id=$1 and job_id=$2
        union select 'invoice',id from ems.invoices where organization_id=$1 and job_id=$2`;
      break;
    case 'invoice':
      sql = `select 'payment' as "entityType",id as "entityId" from ems.payments where organization_id=$1 and invoice_id=$2`;
      break;
    default:
      return [];
  }
  return tx.query<ActivityTarget>(sql, [tx.actor.organizationId, entityId]);
}

const entityLabels: Record<string, string> = {
  client: 'Client', property: 'Property', request: 'Request', quote: 'Quote', job: 'Job',
  invoice: 'Invoice', visit: 'Visit', expense: 'Expense', time_entry: 'Time entry', payment: 'Payment',
};
const statusLabels: Record<string, string> = {
  new: 'New', in_review: 'In review', quoted: 'Quoted', closed: 'Closed', draft: 'Draft',
  issued: 'Issued', approved: 'Approved', changes_requested: 'Changes requested', declined: 'Declined',
  archived: 'Archived', unscheduled: 'Unscheduled', scheduled: 'Scheduled', in_progress: 'In progress',
  completed: 'Completed', cancelled: 'Cancelled', void: 'Void', submitted: 'Submitted',
};
function activitySummary(entityType: string, action: string, status: string | null): string {
  const label = Object.hasOwn(entityLabels, entityType) ? entityLabels[entityType] : 'Record';
  if (action === 'status_changed') {
    return status !== null && Object.hasOwn(statusLabels, status)
      ? `Status changed to ${statusLabels[status]}` : 'Status changed';
  }
  switch (action) {
    case 'converted': return 'Job created from quote';
    case 'payment_recorded': return 'Payment recorded';
    case 'payment_voided': return 'Payment voided';
    case 'revision_saved': return 'Quote revision saved';
    case 'changes_requested': return 'Quote changes requested';
    case 'timer_started': return 'Timer started';
    case 'timer_stopped': return 'Timer stopped';
    case 'created': case 'updated': case 'archived': case 'restored': case 'issued':
    case 'approved': case 'declined': case 'duplicated': case 'voided':
    case 'submitted': case 'rejected': case 'reopened':
      return `${label} ${action}`;
    default: return 'Activity recorded';
  }
}

export async function listActivity(input: {
  entityType: ActivityEntity; entityId: string; includeRelated?: boolean; limit?: number;
}): Promise<ActivityItem[]> {
  try {
    return await withEmsTransaction(async tx => {
      if (tx.actor.role !== 'admin') return [];
      const data = inputSchema.parse(input);
      const targets: ActivityTarget[] = [{ entityType: data.entityType, entityId: data.entityId }];
      if (data.includeRelated) targets.push(...await relatedTargets(tx, data.entityType, data.entityId));
      const rows = await tx.query<Omit<ActivityItem, 'summary'> & { status: string | null }>(`
        select e.id,e.created_at::text as "createdAt",m.display_name as "actorName",
          e.entity_type as "entityType",e.entity_id as "entityId",e.action,e.data->>'status' as status
        from ems.activity_events e
        join ems.memberships m on m.organization_id=e.organization_id and m.user_id=e.actor_id
        join unnest($2::text[],$3::uuid[]) as target(entity_type,entity_id)
          on target.entity_type=e.entity_type and target.entity_id=e.entity_id
        where e.organization_id=$1 and e.entity_id=any($3::uuid[])
        order by e.created_at desc,e.id desc limit $4`, [
        tx.actor.organizationId, targets.map(target => target.entityType), targets.map(target => target.entityId), data.limit,
      ]);
      return rows.map(({ status, ...event }) => ({
        ...event, summary: activitySummary(event.entityType, event.action, status),
      }));
    });
  } catch (error) {
    // The shared transaction helper reports missing authentication/membership with these errors.
    if (error instanceof Error && ['Authentication required', 'Exactly one active membership required'].includes(error.message)) return [];
    throw error;
  }
}
