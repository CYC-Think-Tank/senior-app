import { requireAdmin } from "@/lib/auth";
import type { Guest, InterviewSession } from "@/lib/types";
import {
  AdminDashboardView,
  type AdminDashboardCopy,
  type UsagePoint,
} from "./admin-dashboard-view";

export const dynamic = "force-dynamic";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const copyByLocale: Record<string, AdminDashboardCopy> = {
  en: {
    eyebrow: "WiseShare overview",
    title: "Good to see you.",
    intro: "A clear view of the people, stories, and conversations growing across WiseShare.",
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
  },
  "zh-Hans": {
    eyebrow: "慧仁享概览",
    title: "欢迎回来。",
    intro: "清晰了解慧仁享中不断增长的用户、故事和对话。",
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
  },
  "zh-Hant": {
    eyebrow: "慧仁享概覽",
    title: "歡迎回來。",
    intro: "清楚掌握慧仁享中持續成長的使用者、故事和對話。",
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
  },
};

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();

  const [{ data: guestRows }, { data: sessionRows }] = await Promise.all([
    // Every storyteller, however they got here: admins no longer add anyone by
    // hand, so filtering by origin would leave these counts permanently at zero.
    supabase
      .from("guests")
      .select("id, user_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("guest_id, status, duration_ms, created_at")
      .order("created_at", { ascending: false }),
  ]);

  type GuestRow = Pick<Guest, "id" | "user_id">;
  type SessionRow = Pick<
    InterviewSession,
    "guest_id" | "status" | "duration_ms" | "created_at"
  >;
  const guests = (guestRows ?? []) as GuestRow[];
  const sessions = (sessionRows ?? []) as SessionRow[];
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
    />
  );
}
