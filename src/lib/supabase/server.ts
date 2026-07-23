import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * Cookie-based client for server components, server actions, and route
 * handlers. Runs with the signed-in user's permissions (RLS enforced).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseAuthCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a server component where cookies are read-only;
            // the proxy (src/proxy.ts) handles session refresh in that case.
          }
        },
      },
    }
  );
}
