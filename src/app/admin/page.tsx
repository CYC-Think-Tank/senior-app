import { requireAdmin } from "@/lib/auth";
import type { Guest, InterviewSession } from "@/lib/types";
import {
  AdminDashboardView,
  type AdminDashboardCopy,
  type GuestDirectoryItem,
  type UsagePoint,
} from "./admin-dashboard-view";

export const dynamic = "force-dynamic";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const copyByLocale: Record<string, AdminDashboardCopy> = {
  en: {
    eyebrow: "WiseShare overview",
    title: "Good to see you.",
    intro: "A clear view of the people, stories, and conversations growing across WiseShare.",
    newGuest: "Add a guest",
    totalUsers: "Total users",
    recordingsToday: "Recordings today",
    averageTime: "Average conversation time",
    registered: "Registered",
    notRegistered: "Not registered",
    usersByCategory: "Users by category",
    conversationsByCategory: "Conversations by category",
    usage: "Conversation activity",
    lastSevenDays: "Last 7 days",
    conversations: "conversations",
    ready: "Recorded",
    recording: "In progress",
    pending: "Waiting",
    guestDirectory: "Guest directory",
    guestDirectoryIntro: "Everyone who has been invited to share their stories.",
    guest: "Guest",
    account: "Account",
    language: "Language",
    lastActive: "Last active",
    never: "Not yet",
    noGuests: "No guests have been added yet.",
    openGuest: "Open guest",
  },
  "zh-Hans": {
    eyebrow: "慧仁享概览",
    title: "欢迎回来。",
    intro: "清晰了解慧仁享中不断增长的用户、故事和对话。",
    newGuest: "添加访客",
    totalUsers: "用户总数",
    recordingsToday: "今日录音",
    averageTime: "平均对话时长",
    registered: "已注册",
    notRegistered: "未注册",
    usersByCategory: "用户类别",
    conversationsByCategory: "对话类别",
    usage: "对话活跃度",
    lastSevenDays: "最近 7 天",
    conversations: "次对话",
    ready: "已录制",
    recording: "进行中",
    pending: "等待中",
    guestDirectory: "访客列表",
    guestDirectoryIntro: "所有受邀分享故事的人。",
    guest: "访客",
    account: "账户",
    language: "语言",
    lastActive: "最近活跃",
    never: "暂无",
    noGuests: "尚未添加访客。",
    openGuest: "打开访客",
  },
  "zh-Hant": {
    eyebrow: "慧仁享概覽",
    title: "歡迎回來。",
    intro: "清楚掌握慧仁享中持續成長的使用者、故事和對話。",
    newGuest: "新增訪客",
    totalUsers: "使用者總數",
    recordingsToday: "今日錄音",
    averageTime: "平均對話時長",
    registered: "已註冊",
    notRegistered: "未註冊",
    usersByCategory: "使用者類別",
    conversationsByCategory: "對話類別",
    usage: "對話活躍度",
    lastSevenDays: "最近 7 天",
    conversations: "次對話",
    ready: "已錄製",
    recording: "進行中",
    pending: "等待中",
    guestDirectory: "訪客列表",
    guestDirectoryIntro: "所有受邀分享故事的人。",
    guest: "訪客",
    account: "帳戶",
    language: "語言",
    lastActive: "最近活躍",
    never: "暫無",
    noGuests: "尚未新增訪客。",
    openGuest: "開啟訪客",
  },
};

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();

  const [{ data: guestRows }, { data: sessionRows }] = await Promise.all([
    // Only people an admin invited; see the note in guests/page.tsx.
    supabase
      .from("guests")
      .select("id, name, bio, topics, language, user_id")
      .eq("origin", "admin_invite")
      .order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("guest_id, status, duration_ms, created_at")
      .order("created_at", { ascending: false }),
  ]);

  type GuestRow = Pick<Guest, "id" | "name" | "bio" | "topics" | "language" | "user_id">;
  type SessionRow = Pick<
    InterviewSession,
    "guest_id" | "status" | "duration_ms" | "created_at"
  >;
  const guests = (guestRows ?? []) as GuestRow[];
  // The counts and the chart below describe the same people the directory
  // lists, so conversations belonging to guests we filtered out drop away too.
  const guestIds = new Set(guests.map((guest) => guest.id));
  const sessions = ((sessionRows ?? []) as SessionRow[]).filter((session) =>
    guestIds.has(session.guest_id),
  );
  const today = dateKey(new Date());
  const finishedSessions = sessions.filter((session) => session.status === "ready");
  const durations = finishedSessions
    .map((session) => session.duration_ms ?? 0)
    .filter((duration) => duration > 0);
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
    : 0;

  const usage: UsagePoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const key = dateKey(date);
    return {
      key,
      value: sessions.filter((session) => dateKey(new Date(session.created_at)) === key).length,
    };
  });

  const sessionsByGuest = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const existing = sessionsByGuest.get(session.guest_id) ?? [];
    existing.push(session);
    sessionsByGuest.set(session.guest_id, existing);
  }

  const guestDirectory: GuestDirectoryItem[] = guests.map((guest) => {
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

  return (
    <AdminDashboardView
      copies={copyByLocale}
      totalUsers={guests.length}
      recordingsToday={finishedSessions.filter(
        (session) => dateKey(new Date(session.created_at)) === today,
      ).length}
      averageDurationMs={averageDurationMs}
      registeredUsers={guests.filter((guest) => Boolean(guest.user_id)).length}
      unregisteredUsers={guests.filter((guest) => !guest.user_id).length}
      conversationCategories={{
        ready: sessions.filter((session) => session.status === "ready").length,
        recording: sessions.filter((session) => session.status === "recording").length,
        pending: sessions.filter((session) => session.status === "pending").length,
      }}
      usage={usage}
      guests={guestDirectory}
    />
  );
}
