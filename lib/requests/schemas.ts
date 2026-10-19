import { z } from "zod";
import { listSchema, optionalText } from "@/lib/clients/schemas";
import { resolveSydneyDateTime } from "@/lib/domain/sydney-date-time";
export const dateSchema = z.iso.date();
export const requestSchema = z.object({
  id: z.uuid().optional(), clientId: z.uuid(), propertyId: z.union([z.uuid(), z.literal("")]).optional().transform(value => value || null),
  title: z.string().trim().min(1, "Enter a request title.").max(240), description: optionalText(20000),
  preferredDate: z.union([dateSchema, z.literal("")]).optional().transform(value => value || null),
  assessmentAt: z.union([z.iso.datetime({ offset: true }), z.literal("")]).optional().transform(value => value || null),
  status: z.enum(["new", "in_review", "quoted", "closed"]).default("new"),
}).strict();
export const requestListSchema = listSchema.extend({ status: z.enum(["all", "new", "in_review", "quoted", "closed"]).default("all"), from: z.union([dateSchema, z.literal("")]).default(""), to: z.union([dateSchema, z.literal("")]).default(""), clientId: z.union([z.uuid(), z.literal("")]).default("") });
export const requestStatusLabels = { new: "New", in_review: "In review", quoted: "Quoted", closed: "Closed" } as const;
export const sydneyAssessmentSchema = z.string().transform((value, context) => {
  if (!value) return "";
  const [date, time] = value.split("T"); const resolved = resolveSydneyDateTime(date ?? "", time ?? "");
  if (!resolved.ok) { context.addIssue({ code: "custom", message: resolved.error.message }); return z.NEVER; }
  return resolved.data.iso;
});
export const assessmentFormSchema = z.object({
  local: z.string(), occurrence: z.enum(["", "earlier", "later"]),
}).transform(({ local, occurrence }, context) => {
  if (!local) return "";
  const [date, time] = local.split("T");
  const resolved = resolveSydneyDateTime(date ?? "", time ?? "", occurrence || undefined);
  if (!resolved.ok) { context.addIssue({ code: "custom", message: resolved.error.message }); return z.NEVER; }
  return resolved.data.iso;
});
