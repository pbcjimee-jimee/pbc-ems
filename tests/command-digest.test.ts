import { describe, expect, it } from "vitest";
import { commandDigest } from "@/lib/domain/command-digest";

describe("command payload identity", () => {
  it("uses the same identity for reordered object keys", () => {
    expect(commandDigest({ amount: "12.30", lines: [{ name: "Paint", quantity: "2" }] }))
      .toBe(commandDigest({ lines: [{ quantity: "2", name: "Paint" }], amount: "12.30" }));
  });
  it("distinguishes changed money and line order", () => {
    expect(commandDigest({ amount: "12.30" })).not.toBe(commandDigest({ amount: "12.31" }));
    expect(commandDigest({ lines: ["A", "B"] })).not.toBe(commandDigest({ lines: ["B", "A"] }));
  });
  it("rejects non-finite numeric payloads instead of silently treating them as null", () => {
    expect(() => commandDigest({ amount: Number.NaN })).toThrow("Invalid command payload");
    expect(() => commandDigest({ value: Infinity })).toThrow("Invalid command payload");
  });
});

