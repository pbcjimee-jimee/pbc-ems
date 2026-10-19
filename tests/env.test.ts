import { describe, expect, it, vi } from "vitest";
import { getServerEnv } from "@/lib/env";

vi.mock("server-only", () => ({}));

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key",
  EMS_DATABASE_URL: "postgresql://ems_runtime:private-password@127.0.0.1:54322/postgres",
};

describe("EMS environment boundary", () => {
  it("fails closed when configuration is missing", () => {
    expect(() => getServerEnv({})).toThrow("EMS_NOT_CONFIGURED");
  });

  it("returns the explicit EMS configuration", () => {
    expect(getServerEnv(valid)).toEqual(valid);
  });

  it.each(Object.keys(valid))("rejects a missing %s", (key) => {
    const env: Partial<NodeJS.ProcessEnv> = { ...valid, [key]: "   " };
    expect(() => getServerEnv(env)).toThrow(key);
  });

  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://user:secret@example.com" },
    { EMS_DATABASE_URL: "https://private-password@example.com" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private-value" },
  ])("rejects invalid configuration without exposing secret values", (changes) => {
    try {
      getServerEnv({ ...valid, ...changes });
      expect.fail("configuration must fail closed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("EMS_NOT_CONFIGURED");
      expect(message).not.toContain("private-password");
      expect(message).not.toContain("private-value");
      expect(message).not.toContain("user:secret");
    }
  });

  it("does not reuse quote application or service-role variables", () => {
    expect(() => getServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      DATABASE_URL: valid.EMS_DATABASE_URL,
    })).toThrow("EMS_NOT_CONFIGURED");
  });

  it("accepts the local Supabase anon key and rejects a service-role JWT", () => {
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
    const anonKey = jwt("anon");
    expect(getServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey }).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(anonKey);
    expect(() => getServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") })).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});
