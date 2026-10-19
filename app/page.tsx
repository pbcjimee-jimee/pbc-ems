import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function IndexPage() {
  let configured = false;
  try {
    getServerEnv();
    configured = true;
  } catch {
    // Setup never claims that an unconfigured EMS is connected or authenticated.
  }
  redirect(configured ? "/home" : "/setup");
}
