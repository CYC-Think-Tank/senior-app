import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export type SignedInUser = {
  id: string;
  email: string;
};

/**
 * The signed-in account for this request, or null.
 *
 * Cached per request: several layouts and the locale resolver all ask, and
 * without the cache each one would re-read the session row.
 *
 * Note what these helpers no longer return: a database client. Under Supabase
 * they handed back an RLS-scoped client whose every query was silently
 * filtered to what the caller could see. There is one unrestricted client now
 * (`@/lib/db`), so callers must apply the checks in `@/lib/authz` themselves.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<
  SignedInUser | null
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
});

/** The caller's profile row, or null when they are not signed in. */
export const getProfile = cache(async function getProfile() {
  const user = await getSessionUser();
  if (!user) return null;
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  return profile ?? null;
});

/** Ensures the current request is from any signed-in user (family or admin). */
export const requireUser = cache(async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { user };
});

/**
 * Ensures the current request is from a signed-in admin; redirects otherwise.
 *
 * The role lives on `profiles`, not on the auth user, so this is a read rather
 * than a claim check — the same thing `public.is_admin()` did inside Postgres.
 */
export const requireAdmin = cache(async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(and(eq(profiles.id, user.id)))
    .limit(1);
  if (profile?.role !== "admin") redirect("/dashboard");

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
