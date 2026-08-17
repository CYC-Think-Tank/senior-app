import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Authorisation for the native client.
 *
 * The web front end reaches its data through server components and server
 * actions, which are cookie-bound and not callable from outside a browser. The
 * iOS app holds a Supabase session of its own, so these routes take the access
 * token as a bearer instead — and then behave exactly like the server actions
 * do: read through the caller's RLS-scoped client to authorise, and only then
 * let the service role write.
 *
 * That shape is not incidental. Every social table in this schema is read-only
 * under RLS (see the note at the top of migration 013), so "authorise with the
 * user's client, act with the admin client" is the only correct way to write,
 * on either platform.
 */
export type MobileUser = {
  /** RLS-scoped: sees exactly what this account may see. */
  supabase: SupabaseClient;
  /** Service role. Only ever used after `supabase` has authorised the action. */
  admin: SupabaseClient;
  user: { id: string; email: string };
};

export async function requireMobileUser(
  request: NextRequest
): Promise<MobileUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  // Verified against the auth server rather than trusted from the wire.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  return {
    supabase,
    admin,
    user: { id: data.user.id, email: data.user.email ?? "" },
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in again." }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "Something went wrong.") {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Body parsing that treats a malformed payload as an empty one. */
export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export function readString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number
): string {
  const value = body[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
