import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";

// Next 16 proxy (formerly middleware): refreshes the Supabase auth session on
// navigation so server components always see a valid token. Route guarding
// itself lives in the layouts.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before .env.local is filled in, skip session refresh so pages can still
  // render (they'll show their own errors where Supabase is actually needed).
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseAuthCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headersToSet).forEach(([name, value]) =>
            response.headers.set(name, value)
          );
        },
      },
    }
  );

  // Verify locally against the project's cached JWKS when asymmetric signing
  // is enabled; this avoids an Auth server round trip on most navigations.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/login", "/signup"],
};
