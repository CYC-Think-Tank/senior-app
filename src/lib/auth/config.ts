import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from "@/lib/db/schema";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { sendAuthEmail } from "@/lib/resend";

/**
 * Better Auth, holding the accounts that used to live in Supabase Auth.
 *
 * Users live in the same Azure database as everything else, which is the whole
 * reason for choosing it: `profiles.id` and `guests.user_id` keep pointing at
 * the id the auth system mints, so the authorization module in src/lib/authz.ts
 * and the application tables never have to reconcile two id spaces.
 *
 * Sessions are rows in `auth_sessions`, not self-contained JWTs. Nothing has to
 * refresh a token on navigation, which is why src/proxy.ts is gone.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Signing up writes `auth_users` and then `auth_accounts`. Left
    // non-transactional (the adapter's default), a failure between the two
    // strands an account with an email but no credentials — and the address is
    // then taken, so the person cannot sign up again or sign in.
    transaction: true,
    // Better Auth addresses its tables by model name; these are ours.
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  advanced: {
    database: {
      // Defers id generation to the `gen_random_uuid()` defaults in
      // 002_better_auth.sql, so ids stay uuids and keep matching the uuid
      // columns that reference them. Without this Better Auth mints its own
      // string ids and the insert fails against a uuid column.
      generateId: "uuid",
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    // Signing up puts you straight into the app, which is what the Supabase
    // flow did with `email_confirm: true` and an immediate sign-in.
    autoSignIn: true,
    requireEmailVerification: false,
    async sendResetPassword({ user, url }) {
      await sendAuthEmail({
        to: user.email,
        actionLink: url,
        kind: "password-reset",
      });
    },
  },

  session: {
    // Matches the 400-day cookie the Supabase setup used (the browser cap), so
    // someone who closes their browser is still signed in when they come back.
    // Older adults using this on a shared family tablet should not be asked to
    // sign in again every week.
    expiresIn: 400 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  plugins: [
    // The iOS app sends its session token as `Authorization: Bearer …` rather
    // than a cookie; see src/lib/mobile/auth.ts.
    bearer(),
    // Must stay last: it is what lets a server action set the session cookie.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
