import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Ensures the current request is from a signed-in admin; redirects otherwise.
 * Returns the (RLS-enforced) user client for data access.
 */
export const requireAdmin = cache(async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role !== "admin") redirect("/family");

  const user = {
    id: userId,
    email:
      typeof data.claims.email === "string" ? data.claims.email : undefined,
  };

  return { supabase, user };
});

/** Ensures the current request is from any signed-in user (family or admin). */
export const requireUser = cache(async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");
  const user = {
    id: userId,
    email:
      typeof data.claims.email === "string" ? data.claims.email : undefined,
  };
  return { supabase, user };
});
