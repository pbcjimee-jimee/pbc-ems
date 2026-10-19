import { requireMembership } from "@/lib/auth/permissions";
import { listRequests } from "@/lib/requests/service";
import { requestStatusLabels } from "@/lib/requests/schemas";
import { RequestList } from "@/components/requests/request-list";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const actor = await requireMembership(); const data = await listRequests(params);
  const link = (change: Record<string, string>) => `/requests?${new URLSearchParams({ ...data.filter, page: "1", ...change })}`;
  const counts = (data as { counts?: Record<string, number> }).counts;
  const filtered = !!(data.filter.search || data.filter.from || data.filter.to || data.filter.status !== "all" || data.filter.archive !== "active");
  return <>
    <PageHeader title="Requests" description="Record customer needs, plan assessments and move work into quotes." actions={actor.role === "admin" ? <ButtonLink href="/requests/new" icon="plus">New request</ButtonLink> : null} />
    <Tabs label="Request status" items={[["all", "All"], ...Object.entries(requestStatusLabels)].map(([value, label]) => ({ label, href: link({ status: value }), current: data.filter.status === value, count: counts?.[value] }))} />
    <FilterBar resetHref="/requests" search={{ id: "request-search", label: "Search requests", defaultValue: data.filter.search, placeholder: "Title or client" }}>
      <input type="hidden" name="status" value={data.filter.status} />
      {data.filter.clientId ? <input type="hidden" name="clientId" value={data.filter.clientId} /> : null}
      <div className="field"><label htmlFor="date-from">Preferred from</label><input type="date" name="from" id="date-from" defaultValue={data.filter.from} /></div>
      <div className="field"><label htmlFor="date-to">Preferred to</label><input type="date" name="to" id="date-to" defaultValue={data.filter.to} /></div>
      <SelectFilter id="filter-archive" name="archive" label="Records" defaultValue={data.filter.archive} options={[["active", "Active"], ["archived", "Archived"], ["all", "All records"]]} />
      <SelectFilter id="request-sort" name="sort" label="Sort by" defaultValue={data.filter.sort} options={[["name", "Request title"], ["updated", "Recently updated"]]} />
    </FilterBar>
    <RequestList items={data.items} admin={actor.role === "admin"} filtered={filtered} />
    <Pagination label="Request pages" page={data.page} pageSize={data.pageSize} total={data.total} href={page => link({ page: String(page) })} />
  </>;
}
