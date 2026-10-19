import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/permissions";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/ui/page-header";
export default async function NewClientPage() {
  const actor = await requireMembership(); if (actor.role !== "admin") redirect("/clients");
  return <div className="form-page"><PageHeader back={{ href: "/clients", label: "Clients" }} title="New client" description="Add the main contact and billing details. Add one or more work sites after saving." /><ClientForm commandKey={randomUUID()} /></div>;
}
