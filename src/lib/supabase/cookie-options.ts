import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Supabase refresh tokens rotate as the session is used. A persistent cookie
 * keeps that refresh token available after the browser is closed and reopened.
 *
 * Browsers cap cookie lifetimes at roughly 400 days, so active sessions are
 * renewed within that window whenever Supabase refreshes the token.
 */
export const SUPABASE_AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const supabaseAuthCookieOptions = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: SUPABASE_AUTH_COOKIE_MAX_AGE,
} satisfies CookieOptionsWithName;
