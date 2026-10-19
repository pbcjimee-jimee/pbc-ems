import Link from "next/link";
import { requireMembership } from "@/lib/auth/permissions";
import { listClients } from "@/lib/clients/service";
import { ClientList } from "@/components/clients/client-list";
import { Button } from "@/components/ui/button";
export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const actor = await requireMembership(); const data = await listClients(params);
  const pageLink = (page: number) => `/clients?${new URLSearchParams({ ...data.filter, page: String(page) })}`;
  return <><div className="page-header"><div><h1>Clients</h1><p className="page-description">Customer contacts, billing details and work sites.</p></div>{actor.role === "admin" ? <Link href="/clients/new" className="button">New customer</Link> : null}</div>
    <form className="toolbar" method="get"><div className="field"><label htmlFor="client-search">Search customers</label><input id="client-search" type="search" name="search" defaultValue={data.filter.search} placeholder="Name, email, phone or tag" maxLength={200} /></div><div className="field"><label htmlFor="client-archive">Status</label><select id="client-archive" name="archive" defaultValue={data.filter.archive}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All customers</option></select></div><div className="field"><label htmlFor="client-sort">Sort</label><select id="client-sort" name="sort" defaultValue={data.filter.sort}><option value="name">Customer name</option><option value="updated">Recently updated</option></select></div><Button type="submit" variant="secondary">Apply filters</Button><Link href="/clients">Reset</Link></form>
    <p className="field-hint">{data.total} customers · page {data.page}</p><ClientList items={data.items} admin={actor.role === "admin"} /><nav aria-label="Customer pages" className="toolbar">{data.page > 1 ? <Link className="button button-secondary" href={pageLink(data.page - 1)}>Previous</Link> : null}{data.page * data.pageSize < data.total ? <Link className="button button-secondary" href={pageLink(data.page + 1)}>Next</Link> : null}</nav>
  </>;
}
