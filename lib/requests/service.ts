import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withEmsTransaction, type EmsTx } from "@/lib/db/transaction";
import type { Result, Versioned } from "@/lib/domain/types";
import { runCommand, recordActivity, requireVersion, WorkflowError } from "@/lib/workflows/commands";
import { clientMutation } from "@/lib/clients/service";
import { commandMetaSchema, invalidResult } from "@/lib/clients/schemas";
import { requestSchema, requestListSchema } from "./schemas";
export type RequestSummary = Versioned & { clientId: string; propertyId: string | null; clientName: string; propertyLabel: string | null; title: string; status: "new" | "in_review" | "quoted" | "closed"; preferredDate: string | null; assessmentAt: string | null; archivedAt: string | null };
export type RequestCounts = Record<"all" | RequestSummary["status"], number>;
export type RequestPipeline = {
  new: { count: number };
  assessmentScheduled: { count: number };
  assessmentOverdue: { count: number };
};
export type RequestDetail = RequestSummary & { description: string; address: string | null; quotes: { id: string; title: string; status: string }[]; visits: { id: string; title: string; status: string }[]; jobs:{id:string;title:string;status:string}[] };
const columns = 'r.id,r.version,r.client_id as "clientId",r.property_id as "propertyId",c.display_name as "clientName",p.label as "propertyLabel",r.title,r.status,r.preferred_date::text as "preferredDate",r.assessment_at::text as "assessmentAt",r.archived_at::text as "archivedAt"';
const joins = "from ems.requests r join ems.clients c on c.id=r.client_id and c.organization_id=r.organization_id left join ems.properties p on p.id=r.property_id and p.organization_id=r.organization_id";
export async function saveRequest(input: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed = requestSchema.safeParse(input); if (!parsed.success) return invalidResult(parsed.error);
  const command = commandMetaSchema.safeParse(meta); if (!command.success) return invalidResult(command.error); const data = parsed.data;
  return clientMutation(tx => runCommand(tx, "request.save", command.data, data, async () => {
    const org = tx.actor.organizationId; const id = data.id ?? randomUUID();
    const [client] = await tx.query("select id from ems.clients where id=$1 and organization_id=$2 and archived_at is null for share", [data.clientId, org]);
    if (!client) throw new WorkflowError("INVALID_CLIENT", "Choose an active customer.");
    if (data.propertyId) {
      const [property] = await tx.query("select id from ems.properties where id=$1 and organization_id=$2 and client_id=$3 and archived_at is null for share", [data.propertyId, org, data.clientId]);
      if (!property) throw new WorkflowError("INVALID_PROPERTY", "Choose an active site belonging to this customer.");
    }
    let currentStatus = "new";
    if (data.id) {
      const [current] = await tx.query<Versioned & { status: string; client_id: string; property_id: string | null }>("select id,version,status,client_id,property_id from ems.requests where id=$1 and organization_id=$2 for update", [id, org]);
      if (!current) throw new WorkflowError("NOT_FOUND", "Request not found."); requireVersion(current.version, command.data.expectedVersion); currentStatus = current.status;
      const linked = await tx.query("select id from ems.quotes where request_id=$1 and organization_id=$2 union all select id from ems.jobs where request_id=$1 and organization_id=$2 limit 1", [id, org]);
      if (linked.length && (current.client_id !== data.clientId || current.property_id !== data.propertyId)) throw new WorkflowError("LINKED_WORK", "Customer and site cannot change after a quote or job is linked.");
    } else requireVersion(0, command.data.expectedVersion);
    const transitions: Record<string, string[]> = { new: ["new", "in_review", "closed"], in_review: ["in_review", "quoted", "closed"], quoted: ["quoted", "closed"], closed: ["closed", "in_review"] };
    if (!transitions[currentStatus].includes(data.status)) throw new WorkflowError("INVALID_STATUS", "Move the request into review before the next stage.");
    if (data.status === "quoted") {
      const issued = await tx.query("select id from ems.quotes where request_id=$1 and organization_id=$2 and status in ('issued','approved','changes_requested','declined') limit 1", [id, org]);
      if (!issued.length) throw new WorkflowError("INVALID_STATUS", "Issue a linked quote before marking this request quoted.");
    }
    const values = [data.clientId, data.propertyId, data.title, data.description, data.status, data.preferredDate, data.assessmentAt, id, org];
    const [saved] = data.id
      ? await tx.query<Versioned>("update ems.requests set client_id=$1,property_id=$2,title=$3,description=$4,status=$5,preferred_date=$6,assessment_at=$7,version=version+1,updated_at=now() where id=$8 and organization_id=$9 returning id,version", values)
      : await tx.query<Versioned>("insert into ems.requests(client_id,property_id,title,description,status,preferred_date,assessment_at,id,organization_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,version", values);
    await recordActivity(tx, "request", id, data.id ? "updated" : "created", { status: data.status }); return saved;
  }));
}
export async function archiveRequest(id: unknown, archived: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed = z.object({ id: z.uuid(), archived: z.boolean(), meta: commandMetaSchema }).safeParse({ id, archived, meta }); if (!parsed.success) return invalidResult(parsed.error); const data = parsed.data;
  return clientMutation(tx => runCommand(tx, "request.archive", data.meta, { id: data.id, archived: data.archived }, async () => {
    const [current] = await tx.query<Versioned>("select id,version from ems.requests where id=$1 and organization_id=$2 for update", [data.id, tx.actor.organizationId]);
    if (!current) throw new WorkflowError("NOT_FOUND", "Request not found."); requireVersion(current.version, data.meta.expectedVersion);
    const [saved] = await tx.query<Versioned>("update ems.requests set archived_at=$1,version=version+1,updated_at=now() where id=$2 and organization_id=$3 returning id,version", [data.archived ? new Date().toISOString() : null, data.id, tx.actor.organizationId]);
    await recordActivity(tx, "request", data.id, data.archived ? "archived" : "restored"); return saved;
  }));
}
export async function listRequests(input: unknown = {}) {
  const parsed = requestListSchema.safeParse(input); const filter = parsed.success ? parsed.data : requestListSchema.parse({});
  return withEmsTransaction(async tx => {
    const where = `r.organization_id=$1 and ($2='' or r.title ilike '%'||$2||'%' or c.display_name ilike '%'||$2||'%') and ($3='all' or ($3='active' and r.archived_at is null) or ($3='archived' and r.archived_at is not null)) and ($4='' or r.preferred_date>=nullif($4,'')::date) and ($5='' or r.preferred_date<=nullif($5,'')::date) and ($6='' or r.client_id=nullif($6,'')::uuid)`;
    const values = [tx.actor.organizationId, filter.search, filter.archive, filter.from, filter.to, filter.clientId];
    const [count] = await tx.query<Record<keyof RequestCounts, string>>(`select count(*)::text as "all",
      (count(*) filter (where r.status='new'))::text as new,
      (count(*) filter (where r.status='in_review'))::text as in_review,
      (count(*) filter (where r.status='quoted'))::text as quoted,
      (count(*) filter (where r.status='closed'))::text as closed
      ${joins} where ${where}`, values);
    const counts: RequestCounts = { all: Number(count.all), new: Number(count.new), in_review: Number(count.in_review), quoted: Number(count.quoted), closed: Number(count.closed) };
    const items = await tx.query<RequestSummary>(`select ${columns} ${joins} where ${where} and ($7='all' or r.status=$7) order by ${filter.sort === "updated" ? "r.updated_at desc,r.id" : "r.title,r.id"} limit 25 offset $8`, [...values, filter.status, (filter.page - 1) * 25]);
    return { items, total: counts[filter.status], page: filter.page, pageSize: 25, filter, counts };
  });
}
export async function readRequestPipeline(tx: EmsTx, today: string): Promise<RequestPipeline> {
  const [row] = await tx.query<{ new: string; assessment_scheduled: string; assessment_overdue: string }>(`select
    (count(*) filter (where r.status='new'
      and not exists(select 1 from ems.jobs j where j.request_id=r.id and j.organization_id=r.organization_id)
      and not exists(select 1 from ems.quotes q join ems.quote_revisions qr on qr.quote_id=q.id and qr.organization_id=q.organization_id
        where q.request_id=r.id and q.organization_id=r.organization_id
          and (qr.issued_at is not null or qr.status in ('issued','approved','changes_requested','declined')))
    ))::text as new,
    (count(*) filter (where exists(select 1 from ems.visits v
      where v.request_id=r.id and v.organization_id=r.organization_id and v.type='assessment' and v.status in ('scheduled','in_progress'))))::text as assessment_scheduled,
    (count(*) filter (where exists(select 1 from ems.visits v
      where v.request_id=r.id and v.organization_id=r.organization_id and v.type='assessment' and v.status in ('scheduled','in_progress')
        and (case when v.all_day then v.end_date<$2::date else v.ends_at<now() end))))::text as assessment_overdue
    from ems.requests r where r.organization_id=$1 and r.archived_at is null and r.status<>'closed'`, [tx.actor.organizationId, today]);
  return {
    new: { count: Number(row.new) },
    assessmentScheduled: { count: Number(row.assessment_scheduled) },
    assessmentOverdue: { count: Number(row.assessment_overdue) },
  };
}
export async function readRequest(id: string): Promise<RequestDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return withEmsTransaction(async tx => {
    const [request] = await tx.query<Omit<RequestDetail, "quotes" | "visits" | "jobs">>(`select ${columns},r.description,p.address ${joins} where r.id=$1 and r.organization_id=$2`, [id, tx.actor.organizationId]);
    if (!request) return null;
    const quotes = tx.actor.role === "admin" ? await tx.query<RequestDetail["quotes"][number]>("select id,title,status from ems.quotes where request_id=$1 and organization_id=$2 order by created_at desc", [id, tx.actor.organizationId]) : [];
    const visits = await tx.query<RequestDetail["visits"][number]>("select id,title,status from ems.visits where request_id=$1 and organization_id=$2 order by created_at desc", [id, tx.actor.organizationId]);
    const jobs=await tx.query<RequestDetail['jobs'][number]>('select id,title,status from ems.jobs where request_id=$1 and organization_id=$2 order by created_at desc',[id,tx.actor.organizationId]);
    return { ...request, quotes, visits, jobs };
  });
}
