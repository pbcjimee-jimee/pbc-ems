export function sqlErrorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
export function isConstraintConflict(error: unknown): boolean { return ["23505", "23P01"].includes(sqlErrorCode(error) ?? ""); }
