import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. Server-side only; never import from
 * client components. Used for token-gated flows (interview/review links,
 * which have no logged-in user) and for signing storage URLs.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
