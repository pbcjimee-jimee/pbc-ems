import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/permissions";
import { clientOptions } from "@/lib/clients/service";
import { RequestForm } from "@/components/requests/request-form";
import { EmptyState } from "@/components/ui/empty-state";
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const actor = await requireMembership(); if (actor.role !== "admin") redirect("/requests");
  const search = await searchParams; const options = await clientOptions();
  const clientId = typeof search.clientId === "string" && options.clients.some(client => client.id === search.clientId) ? search.clientId : undefined;
  const propertyId = typeof search.propertyId === "string" && options.properties.some(property => property.id === search.propertyId && property.clientId === clientId) ? search.propertyId : undefined;
  return <><h1>New request</h1><p className="page-description">Choose the customer and site, then record the work they need.</p>{options.clients.length ? <RequestForm {...options} clientId={clientId} propertyId={propertyId} commandKey={randomUUID()} /> : <EmptyState title="Add a customer first" description="A request belongs to an active customer. Create their contact and work site before continuing." action={<Link className="button" href="/clients/new">New customer</Link>} />}</>;
}
