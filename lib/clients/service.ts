import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withEmsTransaction, type EmsTx } from "@/lib/db/transaction";
import { requireAdmin } from "@/lib/auth/permissions";
import type { Result, Versioned } from "@/lib/domain/types";
import { sydneyToday } from "@/lib/domain/format";
import { runCommand, requireVersion, recordActivity, WorkflowError } from "@/lib/workflows/commands";
import { clientSchema, propertySchema, commandMetaSchema, invalidResult, listSchema } from "./schemas";

export type ClientSummary = Versioned & { displayName: string; email: string | null; phone: string | null; companyName: string | null; archivedAt: string | null };
export type Property = Versioned & { clientId: string; label: string; address: string; notes: string | null; archivedAt: string | null };
export type ClientDetail = ClientSummary & {
  billingAddress: string | null; notes: string | null; tags: string[]; properties: Property[];
  requests: { id: string; title: string; status: string }[];
  jobs: { id: string; title: string; status: string; number: string }[];
  quotes?: { id: string; number: string; title: string; status: string; total: string }[];
  invoices?: { id: string; number: string; title: string; status: string; dueOn: string | null; total: string; balance: string; overdue: boolean }[];
  receivables?: { outstandingCount: number; outstandingAmount: string; overdueCount: number; overdueAmount: string };
};
const clientColumns = 'id,version,display_name as "displayName",email,phone,company_name as "companyName",archived_at::text as "archivedAt"';
export async function clientMutation(work: (tx: EmsTx) => Promise<Versioned>): Promise<Result<Versioned>> {
  try { return { ok: true, data: await withEmsTransaction(async tx => {
    if (tx.actor.role !== "admin") throw new WorkflowError("FORBIDDEN", "Only administrators can change customer work.");
    await requireAdmin(tx); return work(tx);
  }) }; } catch (error) {
    return { ok: false, error: error instanceof WorkflowError ? { code: error.code, message: error.message } : { code: "SAVE_FAILED", message: "The change could not be saved. Check your connection and try again." } };
  }
}
export async function saveClient(input: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed = clientSchema.safeParse(input); if (!parsed.success) return invalidResult(parsed.error);
  const command = commandMetaSchema.safeParse(meta); if (!command.success) return invalidResult(command.error);
  const data = parsed.data;
  return clientMutation(tx => runCommand(tx, "client.save", command.data, data, async () => {
    const id = data.id ?? randomUUID(); const org = tx.actor.organizationId;
    const tags = [...new Set(data.tags)];
    let changed: string[] = [];
    if (data.id) {
      const [current] = await tx.query<ClientSummary & Pick<ClientDetail, "billingAddress" | "notes" | "tags">>(`select ${clientColumns},billing_address as "billingAddress",notes,tags from ems.clients where id=$1 and organization_id=$2 for update`, [id, org]);
      if (!current) throw new WorkflowError("NOT_FOUND", "Customer not found.");
      requireVersion(current.version, command.data.expectedVersion);
      changed = (["displayName", "email", "phone", "companyName", "billingAddress", "notes", "tags"] as const)
        .filter(field => JSON.stringify(current[field] ?? "") !== JSON.stringify(field === "tags" ? tags : data[field]));
    } else requireVersion(0, command.data.expectedVersion);
    const values = [data.displayName, data.email, data.phone, data.companyName, data.billingAddress, data.notes, tags, id, org];
    const [saved] = data.id
      ? await tx.query<Versioned>("update ems.clients set display_name=$1,email=$2,phone=$3,company_name=$4,billing_address=$5,notes=$6,tags=$7,version=version+1,updated_at=now() where id=$8 and organization_id=$9 returning id,version", values)
      : await tx.query<Versioned>("insert into ems.clients(display_name,email,phone,company_name,billing_address,notes,tags,id,organization_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,version", values);
    await recordActivity(tx, "client", id, data.id ? "updated" : "created", data.id ? { changed } : {}); return saved;
  }));
}
export async function saveProperty(input: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed = propertySchema.safeParse(input); if (!parsed.success) return invalidResult(parsed.error);
  const command = commandMetaSchema.safeParse(meta); if (!command.success) return invalidResult(command.error);
  const data = parsed.data;
  return clientMutation(tx => runCommand(tx, "property.save", command.data, data, async () => {
    const org = tx.actor.organizationId;
    const [client] = await tx.query("select id from ems.clients where id=$1 and organization_id=$2 and archived_at is null for share", [data.clientId, org]);
    if (!client) throw new WorkflowError("INVALID_CLIENT", "Choose an active customer.");
    const id = data.id ?? randomUUID();
    let changed: string[] = [];
    if (data.id) {
      const [current] = await tx.query<Property & { archived: boolean }>("select id,version,label,address,notes,(archived_at is not null) as archived from ems.properties where id=$1 and client_id=$2 and organization_id=$3 for update", [id, data.clientId, org]);
      if (!current) throw new WorkflowError("INVALID_PROPERTY", "This site does not belong to this customer.");
      requireVersion(current.version, command.data.expectedVersion);
      changed = (["label", "address", "notes", "archived"] as const).filter(field => (current[field] ?? "") !== data[field]);
    } else requireVersion(0, command.data.expectedVersion);
    const values = [data.label, data.address, data.notes, data.archived ? new Date().toISOString() : null, id, org, data.clientId];
    const [saved] = data.id
      ? await tx.query<Versioned>("update ems.properties set label=$1,address=$2,notes=$3,archived_at=$4,version=version+1,updated_at=now() where id=$5 and organization_id=$6 and client_id=$7 returning id,version", values)
      : await tx.query<Versioned>("insert into ems.properties(label,address,notes,archived_at,id,organization_id,client_id) values($1,$2,$3,$4,$5,$6,$7) returning id,version", values);
    await recordActivity(tx, "property", id, data.archived ? "archived" : data.id ? "updated" : "created", { clientId: data.clientId, ...(data.id ? { changed } : {}) }); return saved;
  }));
}
export async function archiveClient(id: unknown, archived: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed = z.object({ id: z.uuid(), archived: z.boolean(), meta: commandMetaSchema }).safeParse({ id, archived, meta });
  if (!parsed.success) return invalidResult(parsed.error);
  const data = parsed.data;
  return clientMutation(tx => runCommand(tx, "client.archive", data.meta, { id: data.id, archived: data.archived }, async () => {
    const [current] = await tx.query<Versioned & { archived: boolean }>("select id,version,(archived_at is not null) as archived from ems.clients where id=$1 and organization_id=$2 for update", [data.id, tx.actor.organizationId]);
    if (!current) throw new WorkflowError("NOT_FOUND", "Customer not found."); requireVersion(current.version, data.meta.expectedVersion);
    const [saved] = await tx.query<Versioned>("update ems.clients set archived_at=$1,version=version+1,updated_at=now() where id=$2 and organization_id=$3 returning id,version", [data.archived ? new Date().toISOString() : null, data.id, tx.actor.organizationId]);
    await recordActivity(tx, "client", data.id, data.archived ? "archived" : "restored", { changed: current.archived !== data.archived ? ["archived"] : [] }); return saved;
  }));
}
export async function listClients(input: unknown = {}) {
  const parsed = listSchema.safeParse(input); const filter = parsed.success ? parsed.data : listSchema.parse({});
  return withEmsTransaction(async tx => {
    const searchWhere = `organization_id=$1 and ($2='' or display_name ilike '%'||$2||'%' or company_name ilike '%'||$2||'%' or email ilike '%'||$2||'%' or phone ilike '%'||$2||'%' ${tx.actor.role === "admin" ? "or array_to_string(tags,',') ilike '%'||$2||'%'" : ""})`;
    const where = `${searchWhere} and ($3='all' or ($3='active' and archived_at is null) or ($3='archived' and archived_at is not null))`;
    const values = [tx.actor.organizationId, filter.search, filter.archive];
    const [count] = await tx.query<{ active: string; archived: string; all: string }>(`select count(*) filter (where archived_at is null)::text as active,count(*) filter (where archived_at is not null)::text as archived,count(*)::text as all from ems.clients where ${searchWhere}`, values.slice(0, 2));
    const counts = { active: Number(count.active), archived: Number(count.archived), all: Number(count.all) };
    const items = await tx.query<ClientSummary>(`select ${clientColumns} from ems.clients where ${where} order by ${filter.sort === "updated" ? "updated_at desc,id" : "display_name,id"} limit 25 offset $4`, [...values, (filter.page - 1) * 25]);
    return { items, total: counts[filter.archive], page: filter.page, pageSize: 25, filter, counts };
  });
}
export async function readClient(id: string): Promise<ClientDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return withEmsTransaction(async tx => {
    const admin = tx.actor.role === "admin"; const values = [id, tx.actor.organizationId];
    const [client] = await tx.query<Omit<ClientDetail, "properties" | "requests" | "jobs">>(`select ${clientColumns},${admin ? 'billing_address as "billingAddress",notes,tags' : 'null::text as "billingAddress",null::text as notes,array[]::text[] as tags'} from ems.clients where id=$1 and organization_id=$2`, values);
    if (!client) return null;
    const properties = await tx.query<Property>(`select id,version,client_id as "clientId",label,address,${admin ? "notes" : "null::text as notes"},archived_at::text as "archivedAt" from ems.properties where client_id=$1 and organization_id=$2 order by archived_at nulls first,label`, values);
    const requests = await tx.query<ClientDetail["requests"][number]>("select id,title,status from ems.requests where client_id=$1 and organization_id=$2 order by created_at desc limit 100", values);
    const jobs = await tx.query<ClientDetail["jobs"][number]>("select id,title,status,number from ems.jobs where client_id=$1 and organization_id=$2 order by created_at desc limit 100", values);
    if (!admin) return { ...client, properties, requests, jobs };
    const quotes = await tx.query<NonNullable<ClientDetail["quotes"]>[number]>(`select q.id,q.number,q.title,q.status,coalesce(r.total,0.00)::text as total
      from ems.quotes q left join ems.quote_revisions r on r.id=q.current_revision_id and r.organization_id=q.organization_id
      where q.client_id=$1 and q.organization_id=$2 order by q.updated_at desc,q.id limit 20`, values);
    const invoiceBalances = `select i.id,i.number,i.title,i.status,i.due_on,i.total,i.updated_at,
      case when i.status='issued' then i.total-p.paid else 0.00 end as balance
      from ems.invoices i left join lateral (
        select coalesce(sum(amount),0) as paid from ems.payments where invoice_id=i.id and organization_id=i.organization_id and voided_at is null
      ) p on true where i.client_id=$1 and i.organization_id=$2`;
    const financeValues = [...values, sydneyToday()];
    const invoices = await tx.query<NonNullable<ClientDetail["invoices"]>[number]>(`with balances as (${invoiceBalances})
      select id,number,title,status,due_on::text as "dueOn",total::text,round(balance,2)::text as balance,
        coalesce(status='issued' and balance>0 and due_on<$3::date,false) as overdue
      from balances order by updated_at desc,id limit 20`, financeValues);
    const [receivables] = await tx.query<NonNullable<ClientDetail["receivables"]>>(`with balances as (${invoiceBalances})
      select count(*)::int as "outstandingCount",round(coalesce(sum(balance),0),2)::text as "outstandingAmount",
        count(*) filter (where due_on<$3::date)::int as "overdueCount",
        round(coalesce(sum(balance) filter (where due_on<$3::date),0),2)::text as "overdueAmount"
      from balances where status='issued' and balance>0`, financeValues);
    return { ...client, properties, requests, jobs, quotes, invoices, receivables };
  });
}
export async function clientOptions() {
  return withEmsTransaction(async tx => ({
    clients: await tx.query<{ id: string; displayName: string }>('select id,display_name as "displayName" from ems.clients where organization_id=$1 and archived_at is null order by display_name', [tx.actor.organizationId]),
    properties: await tx.query<Property>('select id,version,client_id as "clientId",label,address,null::text as notes,null::text as "archivedAt" from ems.properties where organization_id=$1 and archived_at is null order by label', [tx.actor.organizationId]),
  }));
}
