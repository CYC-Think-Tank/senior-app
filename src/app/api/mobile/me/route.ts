import { NextResponse, type NextRequest } from "next/server";
import {
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { isRealtimeVoice } from "@/lib/constants";
import { interviewLanguage, normalizeLocale } from "@/lib/i18n";
import { personName } from "@/lib/names";

export const dynamic = "force-dynamic";

/** The signed-in account, as the app's home and settings screens need it. */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, user } = auth;

  const [{ data: profile }, { data: guest }, { count }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, email, locale, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("guests")
      .select("bio, voice, language")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("requester_id", user.id),
  ]);

  const email = profile?.email ?? user.email;

  return NextResponse.json({
    userId: user.id,
    email,
    displayName: profile?.display_name ?? null,
    name: personName(profile?.display_name, email),
    locale: normalizeLocale(profile?.locale),
    role: profile?.role ?? "family",
    bio: guest?.bio ?? null,
    voice: guest?.voice ?? null,
    language: guest?.language ?? null,
    pendingRequests: count ?? 0,
  });
}

/**
 * Saves the name, bio, voice and language. Port of `updateMyProfile()` plus
 * the locale write the web app does from its language switcher.
 *
 * Both rows go through the service role — family accounts have read-only
 * policies on `profiles` and `guests` — pinned to the verified user id.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;

  const body = await readJson(request);
  const displayName = readString(body, "displayName", 80) || null;
  const about = readString(body, "bio", 1000) || null;
  const rawVoice = readString(body, "voice", 40);
  // Anything unrecognised is stored as null, which reads back as the app's
  // current default rather than freezing a bad value onto the row.
  const voice = isRealtimeVoice(rawVoice) ? rawVoice : null;
  const locale = normalizeLocale(readString(body, "locale", 16));

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const { error } = await admin
    .from("profiles")
    .update({ display_name: displayName, locale })
    .eq("id", user.id);
  if (error) {
    console.error("Could not save the profile:", error);
    return serverError("Could not save your settings.");
  }

  const email = profile?.email ?? user.email;
  const guestFields = {
    name: personName(displayName, email),
    bio: about,
    voice,
  };

  const { data: guest } = await admin
    .from("guests")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // No guest row yet means they have not recorded anything. Creating it now
  // means the bio is already waiting for the host when they do.
  const { error: guestError } = guest
    ? await admin.from("guests").update(guestFields).eq("id", guest.id)
    : await admin.from("guests").insert({
        ...guestFields,
        user_id: user.id,
        origin: "self_serve",
        language: interviewLanguage(locale),
      });

  if (guestError) {
    console.error("Could not save the storyteller details:", guestError);
    return serverError("Could not save your settings.");
  }

  // Carried on the response so the client can replace its whole profile with
  // this one answer, badge included, instead of following up with a GET.
  const { count } = await supabase
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("requester_id", user.id);

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
    pendingRequests: count ?? 0,
  });
}
