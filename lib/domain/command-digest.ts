import { createHash } from "node:crypto";

function canonicalValue(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid command payload");
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, canonicalValue(entry)]));
}
export function commandDigest(payload: unknown): string {
  try {
    const serialized = JSON.stringify(canonicalValue(payload));
    if (serialized === undefined) throw new Error("Invalid command payload");
    return createHash("sha256").update(serialized).digest("hex");
  } catch {
    throw new Error("Invalid command payload");
  }
}

