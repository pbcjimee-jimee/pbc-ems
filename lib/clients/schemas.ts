import { z } from "zod";
import type { Result, Versioned } from "@/lib/domain/types";
export const optionalText = (max = 4000) => z.string().trim().max(max).default("");
export const commandMetaSchema = z.object({ expectedVersion: z.number().int().nonnegative(), idempotencyKey: z.string().min(1).max(200) }).strict();
export const clientSchema = z.object({
  id: z.uuid().optional(), displayName: z.string().trim().min(1, "Enter a customer name.").max(200),
  email: z.union([z.email(), z.literal("")]).default(""), phone: optionalText(80), companyName: optionalText(200),
  billingAddress: optionalText(2000), notes: optionalText(10000), tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
}).strict();
export const propertySchema = z.object({ id: z.uuid().optional(), clientId: z.uuid(), label: z.string().trim().min(1).max(200), address: z.string().trim().min(1).max(2000), notes: optionalText(10000), archived: z.boolean().default(false) }).strict();
export const listSchema = z.object({ search: z.string().trim().max(200).default(""), archive: z.enum(["active", "archived", "all"]).default("active"), page: z.coerce.number().int().min(1).max(100000).default(1), sort: z.enum(["name", "updated"]).default("name") });
export type ClientInput = z.output<typeof clientSchema>;
export type FormState = { result?: Result<Versioned>; values?: Record<string, string> };
export function invalidResult(error: z.ZodError): Result<never> {
  return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields and try again.", fields: Object.fromEntries(error.issues.map(issue => [issue.path.join("."), issue.message])) } };
}
