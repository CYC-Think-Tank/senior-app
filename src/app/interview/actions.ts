"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  interviewLanguage,
  localeCookieName,
  normalizeLocale,
  translate,
} from "@/lib/i18n";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, sessions } from "@/lib/db/schema";

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
  const locale = normalizeLocale(
    (await cookies()).get(localeCookieName)?.value,
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

  let guestId: string;
  try {
    const [guest] = await db
      .insert(guests)
      .values({ name, language, origin: "public" })
      .returning({ id: guests.id });
    guestId = guest.id;
  } catch (guestError) {
    console.error("Could not create a public conversation guest:", guestError);
    return { error: t("interviewStartGenericError") };
  }

  let token: string;
  try {
    const [session] = await db
      .insert(sessions)
      .values({ guest_id: guestId })
      .returning({ token: sessions.token });
    token = session.token;
  } catch (sessionError) {
    console.error(
      "Could not create a public conversation session:",
      sessionError,
    );
    // The guest exists only to hold this conversation, so it goes back with it
    // rather than being left behind as an orphan the sweeper cannot reach.
    await db.delete(guests).where(eq(guests.id, guestId));
    return { error: t("interviewStartGenericError") };
  }

  redirect(`/interview/${token}`);
}
