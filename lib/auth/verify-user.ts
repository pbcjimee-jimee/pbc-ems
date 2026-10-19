import "server-only";
import { createClient } from "@/lib/supabase/server";
export async function verifyRequestUser(): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) throw new Error("Authentication required");
  return { id: data.user.id };
}
