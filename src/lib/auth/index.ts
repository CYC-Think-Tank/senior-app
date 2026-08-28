import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export type SignedInUser = { id: string; email: string };

/**
 * The signed-in account for this request, or null.
 *
 * `cache` keeps a page that calls this from several components to one session
 * lookup per request, the way the Supabase claims read used to be cached.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<
  SignedInUser | null
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
});

/**
 * Ensures the current request is from a signed-in admin; redirects otherwise.
 *
 * Where this used to hand back an RLS-scoped client, it now returns only the
 * verified user: queries go through the shared `db`, which enforces nothing on
 * its own, so callers apply the checks in src/lib/authz.ts themselves.
 */
export const requireAdmin = cache(async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role !== "admin") redirect("/dashboard");

  return { user };
});

/** Ensures the current request is from any signed-in user (family or admin). */
export const requireUser = cache(async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { user };
});

/**
 * Keeps returning users out of the auth forms when their browser still has a
 * valid session.
 */
export async function redirectSignedInUser() {
  const user = await getSessionUser();
  if (!user) return;

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  redirect(profile?.role === "admin" ? "/admin" : "/dashboard");
}
