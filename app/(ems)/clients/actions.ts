"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveClient, saveProperty, archiveClient } from "@/lib/clients/service";
import type { FormState } from "@/lib/clients/schemas";
const textValues = (form: FormData) => Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
const meta = (form: FormData) => ({ expectedVersion: Number(form.get("expectedVersion")), idempotencyKey: form.get("idempotencyKey") });
export async function saveClientAction(_previous: FormState, form: FormData): Promise<FormState> {
  const tags = form.get("tags");
  const result = await saveClient({ id: form.get("id") || undefined, displayName: form.get("displayName"), email: form.get("email"), phone: form.get("phone"), companyName: form.get("companyName"), billingAddress: form.get("billingAddress"), notes: form.get("notes"), tags: typeof tags === "string" ? tags.split(",").map(tag => tag.trim()).filter(Boolean) : tags }, meta(form));
  if (!result.ok) return { result, values: textValues(form) };
  revalidatePath("/clients"); redirect(`/clients/${result.data.id}?saved=client`);
}
export async function savePropertyAction(_previous: FormState, form: FormData): Promise<FormState> {
  const result = await saveProperty({ id: form.get("id") || undefined, clientId: form.get("clientId"), label: form.get("label"), address: form.get("address"), notes: form.get("notes"), archived: form.get("archived") === "on" }, meta(form));
  if (!result.ok) return { result, values: textValues(form) };
  revalidatePath("/clients"); redirect(`/clients/${form.get("clientId")}?saved=site`);
}
export async function archiveClientAction(_previous: FormState, form: FormData): Promise<FormState> {
  const result = await archiveClient(form.get("id"), form.get("archived") === "true", meta(form));
  if (!result.ok) return { result, values: textValues(form) };
  revalidatePath("/clients"); redirect(`/clients/${result.data.id}?saved=status`);
}
