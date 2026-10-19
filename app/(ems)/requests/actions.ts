"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { saveRequest, archiveRequest } from "@/lib/requests/service";
import { assessmentFormSchema } from "@/lib/requests/schemas";
import type { FormState } from "@/lib/clients/schemas";
const values = (form: FormData) => Object.fromEntries([...form.entries()].filter((entry): entry is [string,string] => typeof entry[1] === "string"));
const meta = (form: FormData) => ({ expectedVersion: Number(form.get("expectedVersion")), idempotencyKey: form.get("idempotencyKey") });
export async function saveRequestAction(_previous: FormState, form: FormData): Promise<FormState> {
  const assessment = assessmentFormSchema.safeParse({ local: form.get("assessmentLocal"), occurrence: form.get("assessmentOccurrence") ?? "" });
  if (!assessment.success) return { result: { ok: false, error: { code: "VALIDATION", message: "Check the assessment time.", fields: { assessmentLocal: assessment.error.issues[0].message } } }, values: values(form) };
  const result = await saveRequest({ id: form.get("id") || undefined, clientId: form.get("clientId"), propertyId: form.get("propertyId") || undefined, title: form.get("title"), description: form.get("description"), preferredDate: form.get("preferredDate") || undefined, assessmentAt: assessment.data, status: form.get("status") }, meta(form));
  if (!result.ok) return { result, values: values(form) };
  revalidatePath("/requests"); revalidatePath("/clients"); redirect(`/requests/${result.data.id}?saved=request`);
}
export async function archiveRequestAction(_previous: FormState, form: FormData): Promise<FormState> {
  const result = await archiveRequest(form.get("id"), form.get("archived") === "true", meta(form));
  if (!result.ok) return { result, values: values(form) };
  revalidatePath("/requests"); redirect(`/requests/${result.data.id}?saved=status`);
}
