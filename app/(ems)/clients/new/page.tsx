import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/permissions";
import { ClientForm } from "@/components/clients/client-form";
export default async function NewClientPage() {
  const actor = await requireMembership(); if (actor.role !== "admin") redirect("/clients");
  return <><h1>New customer</h1><p className="page-description">Add the main contact and billing details. Add one or more work sites after saving.</p><ClientForm commandKey={randomUUID()} /></>;
}
