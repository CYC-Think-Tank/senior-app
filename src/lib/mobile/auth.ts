import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";

/**
 * Authorisation for the native client.
 *
 * The web front end reaches its data through server components and server
 * actions, which are cookie-bound and not callable from outside a browser. The
 * iOS app holds a session of its own and sends its token as a bearer instead;
 * Better Auth's bearer plugin accepts it on the same `getSession` call the web
 * side uses, so both platforms verify a session the same way.
 *
 * What used to follow this was "read through the caller's RLS-scoped client to
 * authorise, then let the service role write". There is no RLS-scoped client
 * any more, so the authorising half is now an explicit call into
 * src/lib/authz.ts — the same rules, written down instead of implied.
 */
export type MobileUser = {
  user: { id: string; email: string };
};

export async function requireMobileUser(
  request: NextRequest
): Promise<MobileUser | null> {
  // Verified against the session table rather than trusted from the wire.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  return {
    user: { id: session.user.id, email: session.user.email ?? "" },
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

export function forbidden(message = "You cannot do that.") {
  return NextResponse.json({ error: message }, { status: 403 });
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
