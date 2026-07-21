import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import type { Guest, InterviewSession } from "@/lib/types";
import {
  GuestDirectory,
  type GuestDirectoryCopy,
  type GuestDirectoryItem,
} from "../admin-dashboard-view";

export const dynamic = "force-dynamic";

const copyByLocale: Record<string, GuestDirectoryCopy> = {
  en: {
    guestDirectory: "Guests",
    guestDirectoryIntro: "View everyone invited to share their stories and open their conversation history.",
    newGuest: "Add a guest",
    guest: "Guest",
    account: "Account",
    conversations: "Conversations",
    language: "Language",
    lastActive: "Last active",
    registered: "Registered",
    notRegistered: "Not registered",
    never: "Not yet",
    noGuests: "No guests have been added yet.",
    openGuest: "Open guest",
  },
  "zh-Hans": {
    guestDirectory: "讲述者",
    guestDirectoryIntro: "查看所有受邀分享故事的人及其对话记录。",
    newGuest: "添加讲述者",
    guest: "讲述者",
    account: "账户",
    conversations: "对话",
    language: "语言",
    lastActive: "最近活跃",
    registered: "已注册",
    notRegistered: "未注册",
    never: "暂无",
    noGuests: "尚未添加讲述者。",
    openGuest: "打开讲述者",
  },
  "zh-Hant": {
    guestDirectory: "講述者",
    guestDirectoryIntro: "查看所有受邀分享故事的人及其對話記錄。",
    newGuest: "新增講述者",
    guest: "講述者",
    account: "帳戶",
    conversations: "對話",
    language: "語言",
    lastActive: "最近活躍",
    registered: "已註冊",
    notRegistered: "未註冊",
    never: "暫無",
    noGuests: "尚未新增講述者。",
    openGuest: "開啟講述者",
  },
};

export default async function GuestsPage() {
  const { supabase } = await requireAdmin();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const copy = copyByLocale[locale] ?? copyByLocale.en;
  const [{ data: guestRows }, { data: sessionRows }] = await Promise.all([
    supabase.from("guests").select("*").order("created_at", { ascending: false }),
    supabase.from("sessions").select("*").order("created_at", { ascending: false }),
  ]);
  const guests = (guestRows ?? []) as Guest[];
  const sessions = (sessionRows ?? []) as InterviewSession[];
  const sessionsByGuest = new Map<string, InterviewSession[]>();

  for (const session of sessions) {
    const existing = sessionsByGuest.get(session.guest_id) ?? [];
    existing.push(session);
    sessionsByGuest.set(session.guest_id, existing);
  }

  const directory: GuestDirectoryItem[] = guests.map((guest) => {
    const guestSessions = sessionsByGuest.get(guest.id) ?? [];
    return {
      id: guest.id,
      name: guest.name,
      language: guest.language,
      registered: Boolean(guest.user_id),
      conversationCount: guestSessions.length,
      lastActive: guestSessions[0]?.created_at ?? null,
    };
  });

  return <GuestDirectory locale={locale} copy={copy} guests={directory} standalone />;
}
