import { Brain, HandHeart, ShieldCheck, UserRoundSearch } from "lucide-react";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Locale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupportRequestForm } from "./support-request-form";
import { SupportHistory, type SupportHistoryItem } from "./support-history";
import styles from "./support.module.css";

export const dynamic = "force-dynamic";

const copy: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  safety: string;
  howTitle: string;
  steps: Array<{ title: string; body: string }>;
}> = {
  en: {
    eyebrow: "WiseShare AI · Companion + Human Support",
    title: "Help is one conversation away.",
    intro: "Tell WiseShare what you need. We will understand the request, keep sensitive needs with trained staff, and look for the right person to help.",
    safety: "For emergencies, call 911. WiseShare requests are not monitored in real time.",
    howTitle: "A safe path to human support",
    steps: [
      { title: "We understand", body: "AI identifies the type of help, language, timing, skills, and urgency." },
      { title: "We match safely", body: "A safety check decides whether a student, paid helper, or trained staff member is appropriate." },
      { title: "We follow up", body: "WiseShare confirms the introduction, checks whether the issue was resolved, and escalates when needed." },
    ],
  },
  "zh-Hans": {
    eyebrow: "慧享 AI · 陪伴与人工支持",
    title: "说出需要，就能找到帮助。",
    intro: "告诉慧享您需要什么。我们会了解需求，把敏感事项交给受过培训的员工，并寻找合适的人来协助。",
    safety: "如遇紧急情况，请拨打 911。慧享请求不会被实时监控。",
    howTitle: "安全连接人工支持",
    steps: [
      { title: "了解需求", body: "AI 会识别帮助类型、语言、时间、所需技能和紧急程度。" },
      { title: "安全匹配", body: "安全检查会判断应由学生、付费助手还是受训员工提供帮助。" },
      { title: "持续跟进", body: "慧享会确认介绍、了解问题是否解决，并在需要时升级处理。" },
    ],
  },
  "zh-Hant": {
    eyebrow: "慧享 AI · 陪伴與人工支援",
    title: "說出需要，就能找到協助。",
    intro: "告訴慧享您需要甚麼。我們會了解需要，把敏感事項交給受過培訓的職員，並尋找合適的人協助。",
    safety: "如遇緊急情況，請致電 911。慧享請求不會被即時監察。",
    howTitle: "安全連接人工支援",
    steps: [
      { title: "了解需要", body: "AI 會識別協助類型、語言、時間、所需技能和緊急程度。" },
      { title: "安全配對", body: "安全檢查會判斷應由學生、付費助手還是受訓職員提供協助。" },
      { title: "持續跟進", body: "慧享會確認介紹、了解問題是否解決，並在需要時升級處理。" },
    ],
  },
};

export default async function SupportPage() {
  const [{ user }, locale] = await Promise.all([requireUser(), getPreferredLocale()]);
  const c = copy[locale];
  const icons = [Brain, UserRoundSearch, HandHeart];
  const admin = createSupabaseAdminClient();
  const { data: requestRows } = await admin
    .from("support_requests")
    .select("id, assessment_summary, status, matched_provider_id, created_at")
    .eq("requester_id", user.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(8);
  const providerIds = [...new Set((requestRows ?? []).map((row) => row.matched_provider_id).filter((id): id is string => Boolean(id)))];
  const { data: providers } = providerIds.length
    ? await admin.from("support_providers").select("id, display_name").in("id", providerIds)
    : { data: [] };
  const providerNames = new Map((providers ?? []).map((provider) => [provider.id, provider.display_name]));
  const history: SupportHistoryItem[] = (requestRows ?? []).map((row) => ({
    id: row.id,
    summary: row.assessment_summary,
    status: row.status,
    providerName: row.matched_provider_id ? providerNames.get(row.matched_provider_id) ?? null : null,
    createdAt: row.created_at,
  }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <h1>{c.title}</h1>
        <p className={styles.intro}>{c.intro}</p>
        <p className={styles.safetyNote}><ShieldCheck aria-hidden="true" />{c.safety}</p>
      </header>

      <SupportRequestForm locale={locale} />

      <SupportHistory items={history} locale={locale} />

      <section className={styles.processSection} aria-labelledby="support-process-title">
        <h2 id="support-process-title">{c.howTitle}</h2>
        <div className={styles.processGrid}>
          {c.steps.map((step, index) => {
            const Icon = icons[index];
            return (
              <article key={step.title}>
                <span className={styles.processIcon}><Icon aria-hidden="true" /></span>
                <span className={styles.processNumber}>0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
