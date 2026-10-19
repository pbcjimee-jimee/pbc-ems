import "server-only";
import { z } from "zod";

function isPublicKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "anon";
  } catch {
    return false;
  }
}

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().url().refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1).refine(isPublicKey),
  EMS_DATABASE_URL: z.string().trim().url().refine((value) => {
    try {
      const url = new URL(value);
      return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname);
    } catch {
      return false;
    }
  }),
});

export type ServerEnv = z.infer<typeof schema>;

export function getServerEnv(env: Partial<NodeJS.ProcessEnv> = process.env): ServerEnv {
  const result = schema.safeParse(env);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    // Only field names cross this boundary; Zod errors can contain input values.
    throw new Error(`EMS_NOT_CONFIGURED: ${keys.join(", ")}`);
  }
  return result.data;
}
