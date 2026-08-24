"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  conversationLanguageChosenCookieName,
  conversationLanguageDraftCookieName,
  interviewLanguage,
  localeCookieName,
  localeFromValue,
  normalizeLocale,
  translate,
} from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StartConversationState = {
  error: string | null;
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const attemptsByAddress = new Map<
  string,
  { count: number; resetAt: number }
>();

function capitalizeName(value: string) {
  return value.replace(/(^|\s)(\p{L})/gu, (_, space, letter) =>
    `${space}${letter.toLocaleUpperCase()}`,
  );
}

async function isRateLimited() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const address =
    forwardedFor?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip")?.trim();

  if (!address) {
    return false;
  }

  const now = Date.now();
  const current = attemptsByAddress.get(address);

  if (!current || current.resetAt <= now) {
    attemptsByAddress.set(address, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  current.count += 1;

  if (attemptsByAddress.size > 500) {
    for (const [key, value] of attemptsByAddress) {
      if (value.resetAt <= now) {
        attemptsByAddress.delete(key);
      }
    }
  }

  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

export async function startConversation(
  _previousState: StartConversationState,
  formData: FormData,
): Promise<StartConversationState> {
  const cookieStore = await cookies();
  const submittedLocale = localeFromValue(
    String(formData.get("locale") ?? ""),
  );
  const locale = submittedLocale ?? normalizeLocale(
    cookieStore.get(localeCookieName)?.value,
  );
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  if (String(formData.get("website") ?? "").trim()) {
    return { error: t("interviewStartGenericError") };
  }

  if (await isRateLimited()) {
    return {
      error: t("interviewStartRateLimit"),
    };
  }

  const normalizedName = String(formData.get("name") ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const name = capitalizeName(normalizedName);

  if (
    name.length < 1 ||
    name.length > 80 ||
    !/\p{L}/u.test(name) ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    return { error: t("interviewStartNameError") };
  }

  const language = interviewLanguage(locale);
  const admin = createSupabaseAdminClient();
  const { data: guest, error: guestError } = await admin
    .from("guests")
    .insert({ name, language, origin: "public" })
    .select("id")
    .single();

  if (guestError || !guest) {
    console.error("Could not create a public conversation guest:", guestError);
    return { error: t("interviewStartGenericError") };
  }

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .insert({ guest_id: guest.id })
    .select("token")
    .single();

  if (sessionError || !session) {
    console.error(
      "Could not create a public conversation session:",
      sessionError,
    );
    await admin.from("guests").delete().eq("id", guest.id);
    return { error: t("interviewStartGenericError") };
  }

  cookieStore.set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  cookieStore.set(conversationLanguageChosenCookieName, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  cookieStore.delete(conversationLanguageDraftCookieName);

  redirect(`/interview/${session.token}`);
}
