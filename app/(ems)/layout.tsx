import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env";
import { requireMembership } from "@/lib/auth/permissions";
import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/shell/app-shell";
import type { ReactNode } from "react";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  try { getServerEnv(); } catch { redirect("/setup"); }
  const actor = await requireMembership().catch((error: unknown) => {
    if (error instanceof Error && error.message === "Authentication required") redirect("/login");
    throw error;
  });
  return <AppShell role={actor.role} userName={actor.displayName} companyName={actor.organizationName} signOut={signOut}>{actor.organizationName.includes("Local sample") && <div className="alert" role="status">Local sample workspace · Sample records are separate from your company&apos;s live data.</div>}{children}</AppShell>;
}

