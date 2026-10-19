"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function signIn(formData: FormData): Promise<void> {
  const input = z.object({ email: z.email(), password: z.string().min(8).max(200) }).safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!input.success) redirect("/login?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) redirect("/login?error=credentials");
  redirect("/");
}
export async function signOut(): Promise<void> {
  const supabase = await createClient(); await supabase.auth.signOut(); redirect("/login");
}
