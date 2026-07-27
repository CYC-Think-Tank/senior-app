import { requireAdmin } from "@/lib/auth";
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
  const [{ data: guestRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("guests")
      .select("id, name, bio, topics, language, user_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("guest_id, created_at")
      .order("created_at", { ascending: false }),
  ]);
  type GuestRow = Pick<Guest, "id" | "name" | "bio" | "topics" | "language" | "user_id">;
  type SessionRow = Pick<InterviewSession, "guest_id" | "created_at">;
  const guests = (guestRows ?? []) as GuestRow[];
  const sessions = (sessionRows ?? []) as SessionRow[];
  const sessionsByGuest = new Map<string, SessionRow[]>();

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
      bio: guest.bio,
      topics: guest.topics,
      language: guest.language,
      registered: Boolean(guest.user_id),
      conversationCount: guestSessions.length,
      lastActive: guestSessions[0]?.created_at ?? null,
    };
  });

  return <GuestDirectory copies={copyByLocale} guests={directory} standalone />;
}
