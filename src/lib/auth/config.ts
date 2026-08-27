import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminEmails,
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  profiles,
} from "@/lib/db/schema";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { normalizeEmail } from "@/lib/email";
import { sendPasswordResetEmail } from "@/lib/resend";

/**
 * Better Auth, replacing Supabase Auth.
 *
 * Users live in the Azure database alongside everything else, which is the
 * point: `profiles.id` is the auth user's id, so authorization
 * (`src/lib/authz.ts`) and identity are one join away instead of one service
 * away. Ids are uuids so `profiles.id` and `guests.user_id` keep the column
 * type the schema already had.
 *
 * The four `auth_*` tables are Better Auth's; see `src/lib/db/schema.ts`.
 */

/**
 * The old `handle_new_user()` trigger, moved into the app.
 *
 * Supabase fired a database trigger on `auth.users` to mint the matching
 * `profiles` row and read the admin allowlist. There is no `auth.users` here,
 * so the same work hangs off account creation instead — and staying a hook
 * rather than moving into the signup action means every path that creates a
 * user (today: sign-up; tomorrow: an admin invite) gets a profile, not just
 * the one that remembered to.
 */
async function createProfileForUser(user: { id: string; email: string; name?: string | null }) {
  // Exact match, never `ilike`: `%` and `_` are legal in an email's local part
  // but are wildcards in a LIKE pattern, so signing up as `j%@gmail.com` could
  // otherwise match a seeded admin address and grant admin.
  const email = normalizeEmail(user.email) ?? user.email.toLowerCase();

  const [allowlisted] = await db
    .select({ email: adminEmails.email })
    .from(adminEmails)
    .where(eq(adminEmails.email, email))
    .limit(1);

  await db
    .insert(profiles)
    .values({
      id: user.id,
      email,
      display_name: user.name?.trim() || null,
      role: allowlisted ? "admin" : "family",
    })
    // The trigger was `on conflict (id) do nothing`; keep that, so a retried
    // sign-up cannot fail on a profile that already exists.
    .onConflictDoNothing({ target: profiles.id });
}

export const auth = betterAuth({
  appName: "WiseShare",
  baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),

  advanced: {
    database: {
      // Postgres mints the id with gen_random_uuid(), so `profiles.id` and
      // `guests.user_id` stay uuid columns exactly as 001_migrate_azure.sql
      // declares them.
      generateId: "uuid",
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    // Supabase created accounts with `email_confirm: true` — the address was
    // trusted at sign-up and no confirmation step stood between signing up and
    // using the app. Keeping that, so the flow the UI is built around is
    // unchanged.
    requireEmailVerification: false,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, actionLink: url });
    },
    // Someone resetting a password because they fear it was known to someone
    // else should not leave that person holding a live session.
    revokeSessionsOnPasswordReset: true,
  },

  session: {
    // Supabase's refresh-token cookie was pinned near the browser's ~400-day
    // ceiling so a returning user stayed signed in; match it rather than
    // silently shortening how long people stay signed in.
    expiresIn: 400 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createProfileForUser(user);
        },
      },
    },
  },

  plugins: [
    // The iOS app has no cookie jar; it sends the session token as a bearer,
    // which this turns back into a session. See src/lib/mobile/auth.ts.
    bearer(),
    // Must stay last: it forwards Better Auth's Set-Cookie headers out of
    // server actions, which is how sign-in and sign-out take effect.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
