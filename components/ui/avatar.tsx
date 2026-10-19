export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase() || "?";
}

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return <span className={`avatar${size === "lg" ? " avatar-lg" : ""}`} aria-hidden="true">{initials(name)}</span>;
}
