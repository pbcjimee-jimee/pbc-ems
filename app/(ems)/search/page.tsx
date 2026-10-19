import Link from "next/link";
import { withEmsTransaction } from "@/lib/db/transaction";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status";
import { Icon, type IconName } from "@/components/ui/icon";

type Row = { id: string; title: string; detail: string | null; status: string | null };
type Group = { key: string; label: string; icon: IconName; href: (id: string) => string; rows: Row[] };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim().slice(0, 120) ?? "";
  const groups = q.length >= 2 ? await withEmsTransaction(async tx => {
    const pattern = "%" + q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%";
    const admin = tx.actor.role === "admin";
    const clients = await tx.query<Row>(`select c.id, c.display_name as title, coalesce(c.company_name, (select p.address from ems.properties p where p.client_id = c.id and p.organization_id = c.organization_id and p.address ilike $1 limit 1)) as detail, null as status
      from ems.clients c where c.archived_at is null and (c.display_name ilike $1 or c.company_name ilike $1 or c.email ilike $1 or c.phone ilike $1
      or exists(select 1 from ems.properties p where p.client_id = c.id and p.organization_id = c.organization_id and (p.address ilike $1 or p.label ilike $1))) order by c.display_name limit 10`, [pattern]);
    const requests = await tx.query<Row>(`select r.id, r.title, c.display_name as detail, r.status from ems.requests r join ems.clients c on c.id = r.client_id and c.organization_id = r.organization_id
      where r.archived_at is null and (r.title ilike $1 or c.display_name ilike $1) order by r.updated_at desc limit 10`, [pattern]);
    const jobs = await tx.query<Row>(`select j.id, j.title, '#' || j.number || ' · ' || c.display_name as detail, j.status from ems.jobs j join ems.clients c on c.id = j.client_id and c.organization_id = j.organization_id
      where j.archived_at is null and (j.title ilike $1 or j.number ilike $1 or c.display_name ilike $1) order by j.updated_at desc limit 10`, [pattern]);
    const quotes = admin ? await tx.query<Row>(`select q.id, q.title, '#' || q.number || ' · ' || c.display_name as detail, q.status from ems.quotes q join ems.clients c on c.id = q.client_id and c.organization_id = q.organization_id
      where q.title ilike $1 or q.number ilike $1 or c.display_name ilike $1 order by q.updated_at desc limit 10`, [pattern]) : [];
    const invoices = admin ? await tx.query<Row>(`select i.id, i.title, '#' || i.number || ' · ' || c.display_name as detail, i.status from ems.invoices i join ems.clients c on c.id = i.client_id and c.organization_id = i.organization_id
      where i.title ilike $1 or i.number ilike $1 or c.display_name ilike $1 order by i.updated_at desc limit 10`, [pattern]) : [];
    const all: Group[] = [
      { key: "clients", label: "Clients", icon: "clients", href: id => `/clients/${id}`, rows: clients },
      { key: "requests", label: "Requests", icon: "requests", href: id => `/requests/${id}`, rows: requests },
      ...(admin ? [{ key: "quotes", label: "Quotes", icon: "quotes" as const, href: (id: string) => `/quotes/${id}`, rows: quotes }] : []),
      { key: "jobs", label: "Jobs", icon: "jobs", href: id => `/jobs/${id}`, rows: jobs },
      ...(admin ? [{ key: "invoices", label: "Invoices", icon: "invoices" as const, href: (id: string) => `/invoices/${id}`, rows: invoices }] : []),
    ];
    return all;
  }) : null;
  const total = groups?.reduce((sum, group) => sum + group.rows.length, 0) ?? 0;
  return <>
    <PageHeader title="Search" description="Find clients, work sites and work available to your account." />
    <form className="filter-bar" action="/search" role="search">
      <div className="field filter-search" style={{ maxWidth: 640 }}>
        <label htmlFor="search-q">Name, address, number or title</label>
        <div className="search-input"><Icon name="search" size={18} /><input id="search-q" type="search" name="q" minLength={2} maxLength={120} defaultValue={q} autoFocus required /></div>
      </div>
      <div className="filter-actions"><button className="button" type="submit">Search</button></div>
    </form>
    {groups ? total ? <>
      <p className="filter-summary">{total} result{total === 1 ? "" : "s"} for “{q}”</p>
      <div className="stack">{groups.filter(group => group.rows.length).map(group => <Card key={group.key} title={group.label} count={group.rows.length} flush>
        <ul className="record-list">{group.rows.map(row => <li key={row.id}><Icon name={group.icon} size={18} /><div className="record-main"><Link href={group.href(row.id)}>{row.title}</Link>{row.detail ? <small>{row.detail}</small> : null}</div>{row.status ? <StatusBadge status={row.status} /> : null}</li>)}</ul>
      </Card>)}</div>
    </> : <EmptyState icon="search" title={`No results for “${q}”`} description="Check the spelling, or search by client name, site address, job or quote number." /> : <EmptyState icon="search" title="Search your workspace" description="Enter at least two characters. Press / anywhere to jump to search." />}
  </>;
}
