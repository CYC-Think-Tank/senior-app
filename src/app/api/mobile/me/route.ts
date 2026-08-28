import { NextResponse, type NextRequest } from "next/server";
import {
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { and, count, eq, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, guests, profiles } from "@/lib/db/schema";
import { isRealtimeVoice } from "@/lib/constants";
import { interviewLanguage, normalizeLocale } from "@/lib/i18n";
import { personName } from "@/lib/names";

export const dynamic = "force-dynamic";

/** The signed-in account, as the app's home and settings screens need it. */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  // Every read is pinned to the verified session id, so this only ever
  // describes the caller's own account.
  const [[profile], [guest], pendingRequests] = await Promise.all([
    db
      .select({
        displayName: profiles.displayName,
        email: profiles.email,
        locale: profiles.locale,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select({
        bio: guests.bio,
        voice: guests.voice,
        language: guests.language,
      })
      .from(guests)
      .where(eq(guests.userId, user.id))
      .limit(1),
    countPendingRequests(user.id),
  ]);

  const email = profile?.email ?? user.email;

  return NextResponse.json({
    userId: user.id,
    email,
    displayName: profile?.displayName ?? null,
    name: personName(profile?.displayName, email),
    locale: normalizeLocale(profile?.locale),
    role: profile?.role ?? "family",
    bio: guest?.bio ?? null,
    voice: guest?.voice ?? null,
    language: guest?.language ?? null,
    pendingRequests,
  });
}

/**
 * Saves the name, bio, voice and language. Port of `updateMyProfile()` plus
 * the locale write the web app does from its language switcher.
 *
 * Every write is pinned to the verified session id, so this can only ever
 * change the caller's own profile and storyteller row.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const body = await readJson(request);
  const displayName = readString(body, "displayName", 80) || null;
  const about = readString(body, "bio", 1000) || null;
  const rawVoice = readString(body, "voice", 40);
  // Anything unrecognised is stored as null, which reads back as the app's
  // current default rather than freezing a bad value onto the row.
  const voice = isRealtimeVoice(rawVoice) ? rawVoice : null;
  const locale = normalizeLocale(readString(body, "locale", 16));

  const [profile] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  try {
    await db
      .update(profiles)
      .set({ displayName, locale })
      .where(eq(profiles.id, user.id));
  } catch (error) {
    console.error("Could not save the profile:", error);
    return serverError("Could not save your settings.");
  }

  const email = profile?.email ?? user.email;
  const guestFields = {
    name: personName(displayName, email),
    bio: about,
    voice,
  };

  try {
    const [guest] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.userId, user.id))
      .limit(1);

    // No guest row yet means they have not recorded anything. Creating it now
    // means the bio is already waiting for the host when they do.
    if (guest) {
      await db.update(guests).set(guestFields).where(eq(guests.id, guest.id));
    } else {
      await db.insert(guests).values({
        ...guestFields,
        userId: user.id,
        origin: "self_serve",
        language: interviewLanguage(locale),
      });
    }
  } catch (guestError) {
    console.error("Could not save the storyteller details:", guestError);
    return serverError("Could not save your settings.");
  }

  // Carried on the response so the client can replace its whole profile with
  // this one answer, badge included, instead of following up with a GET.
  const pendingRequests = await countPendingRequests(user.id);

  return NextResponse.json({
    userId: user.id,
    email,
    displayName,
    name: personName(displayName, email),
    locale,
    role: "family",
    bio: about,
    voice,
    language: interviewLanguage(locale),
    pendingRequests,
  });
}

/**
 * How many people are waiting on an answer from this account.
 *
 * Scoped to rows the caller is actually in — without that this would count
 * every pending request in the database, which is what the RLS policy used to
 * prevent implicitly.
 */
async function countPendingRequests(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "pending"),
        ne(friendships.requesterId, userId),
        or(
          eq(friendships.userLow, userId),
          eq(friendships.userHigh, userId),
        ),
      ),
    );
  return row?.value ?? 0;
}
