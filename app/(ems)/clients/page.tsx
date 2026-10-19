import { requireMembership } from "@/lib/auth/permissions";
import { listClients } from "@/lib/clients/service";
import { ClientList } from "@/components/clients/client-list";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const actor = await requireMembership(); const data = await listClients(params);
  const link = (change: Record<string, string>) => `/clients?${new URLSearchParams({ ...data.filter, page: "1", ...change })}`;
  const counts = (data as { counts?: Record<string, number> }).counts;
  return <>
    <PageHeader title="Clients" description="Customer contacts, billing details and work sites." actions={actor.role === "admin" ? <ButtonLink href="/clients/new" icon="plus">New client</ButtonLink> : null} />
    <Tabs label="Client status" items={([["active", "Active"], ["archived", "Archived"], ["all", "All clients"]] as const).map(([value, label]) => ({ label, href: link({ archive: value }), current: data.filter.archive === value, count: counts?.[value] }))} />
    <FilterBar resetHref="/clients" search={{ id: "client-search", label: "Search clients", defaultValue: data.filter.search, placeholder: "Name, email, phone or tag" }}>
      <input type="hidden" name="archive" value={data.filter.archive} />
      <SelectFilter id="client-sort" name="sort" label="Sort by" defaultValue={data.filter.sort} options={[["name", "Client name"], ["updated", "Recently updated"]]} />
    </FilterBar>
    <ClientList items={data.items} admin={actor.role === "admin"} filtered={!!data.filter.search || data.filter.archive !== "active"} />
    <Pagination label="Client pages" page={data.page} pageSize={data.pageSize} total={data.total} href={page => link({ page: String(page) })} />
  </>;
}
