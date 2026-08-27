import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 proxy (formerly middleware): an optimistic redirect, nothing more.
 *
 * Under Supabase this refreshed the auth token on every navigation so server
 * components saw a valid one. Better Auth sessions live in the database and
 * are renewed by `getSession` itself, so there is nothing to refresh here.
 * What is left is worth keeping: bouncing a signed-out visitor away from the
 * portal without paying for a render first.
 *
 * This only reads the cookie — it does not verify it, and it must not be
 * mistaken for the guard. Every protected page still calls `requireUser` or
 * `requireAdmin`, and every route still applies the checks in `@/lib/authz`;
 * a forged cookie gets past this and no further.
 */
const PROTECTED = ["/admin", "/dashboard"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(getSessionCookie(request));

  if (!signedIn && PROTECTED.some((path) => pathname.startsWith(path))) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }

  // /login and /signup are matched too, but sending an already signed-in
  // visitor onward is left to `redirectSignedInUser` on the page: where they
  // belong depends on their role, which this cannot see without a database
  // read the proxy has no business doing.

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/login", "/signup"],
};
