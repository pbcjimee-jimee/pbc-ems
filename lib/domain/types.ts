export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

export type Role = "admin" | "supervisor";
/** Decimal strings are the transport format; never sum money with native numbers. */
export type Money = string;
export type Versioned = { id: string; version: number };
export type CommandMeta = { expectedVersion: number; idempotencyKey: string };
