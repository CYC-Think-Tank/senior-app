import { CalendarClock, Languages, MapPin, ShieldAlert, UserRoundCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { desc, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, supportProviders, supportRequests } from "@/lib/db/schema";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Locale } from "@/lib/i18n";
import { updateSupportRequestStatus } from "./actions";
import styles from "./support-admin.module.css";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  requester_id: string;
  request_text: string;
  assistance_type: string;
  urgency: string;
  preferred_language: string;
  location: string;
  service_mode: string;
  availability: string;
  required_skills: string[];
  safety_level: string;
  recommended_tier: string;
  assessment_summary: string;
  safety_reason: string;
  matched_provider_id: string | null;
  match_score: number | null;
  status: string;
  created_at: string;
};

const copy: Record<Locale, {
  eyebrow: string; title: string; intro: string; empty: string; open: string;
  person: string; assessment: string; safety: string; availability: string;
  matched: string; progress: string; resolve: string; escalate: string;
}> = {
  en: {
    eyebrow: "AI-assisted support desk", title: "Human support queue", intro: "Review new needs, supervise AI matches, and keep sensitive requests with trained staff.", empty: "No support requests yet.", open: "active requests", person: "Requested by", assessment: "AI assessment", safety: "Safety route", availability: "Availability", matched: "Matched helper", progress: "Mark in progress", resolve: "Resolve", escalate: "Escalate",
  },
  "zh-Hans": {
    eyebrow: "AI 辅助支持台", title: "人工支持队列", intro: "审核新需求、监督 AI 匹配，并确保敏感请求由受训员工处理。", empty: "目前没有支持请求。", open: "个进行中请求", person: "请求人", assessment: "AI 评估", safety: "安全分流", availability: "可用时间", matched: "匹配人员", progress: "标记处理中", resolve: "标记已解决", escalate: "升级处理",
  },
  "zh-Hant": {
    eyebrow: "AI 輔助支援台", title: "人工支援隊列", intro: "審核新需要、監督 AI 配對，並確保敏感請求由受訓職員處理。", empty: "目前沒有支援請求。", open: "個進行中請求", person: "請求人", assessment: "AI 評估", safety: "安全分流", availability: "可用時間", matched: "配對人員", progress: "標記處理中", resolve: "標記已解決", escalate: "升級處理",
  },
};

const labels: Record<string, string> = {
  high_school: "High-school volunteer",
  college: "College / university student",
  staff: "Trained WiseShare staff",
  emergency: "Emergency support",
  volunteer_eligible: "Volunteer eligible",
  staff_required: "Staff required",
};

export default async function SupportAdminPage() {
  await requireAdmin();
  const locale = await getPreferredLocale();
  const c = copy[locale];
  // "admins manage support requests" and "admins manage support providers"
  // gave admins the whole queue and the whole roster; `requireAdmin` above is
  // what stands in for both.
  const requests = (await db
    .select({
      id: supportRequests.id,
      requester_id: supportRequests.requester_id,
      request_text: supportRequests.request_text,
      assistance_type: supportRequests.assistance_type,
      urgency: supportRequests.urgency,
      preferred_language: supportRequests.preferred_language,
      location: supportRequests.location,
      service_mode: supportRequests.service_mode,
      availability: supportRequests.availability,
      required_skills: supportRequests.required_skills,
      safety_level: supportRequests.safety_level,
      recommended_tier: supportRequests.recommended_tier,
      assessment_summary: supportRequests.assessment_summary,
      safety_reason: supportRequests.safety_reason,
      matched_provider_id: supportRequests.matched_provider_id,
      match_score: supportRequests.match_score,
      status: supportRequests.status,
      created_at: supportRequests.created_at,
    })
    .from(supportRequests)
    .where(ne(supportRequests.status, "cancelled"))
    .orderBy(desc(supportRequests.created_at))) as RequestRow[];

  const requesterIds = [...new Set(requests.map((request) => request.requester_id))];
  const providerIds = [...new Set(requests.map((request) => request.matched_provider_id).filter((id): id is string => Boolean(id)))];
  const [people, providers] = await Promise.all([
    requesterIds.length
      ? db
          .select({
            id: profiles.id,
            display_name: profiles.display_name,
            email: profiles.email,
          })
          .from(profiles)
          .where(inArray(profiles.id, requesterIds))
      : Promise.resolve([]),
    providerIds.length
      ? db
          .select({
            id: supportProviders.id,
            display_name: supportProviders.display_name,
            provider_type: supportProviders.provider_type,
          })
          .from(supportProviders)
          .where(inArray(supportProviders.id, providerIds))
      : Promise.resolve([]),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const activeCount = requests.filter((request) => !["resolved", "cancelled"].includes(request.status)).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><p>{c.eyebrow}</p><h1>{c.title}</h1><span>{c.intro}</span></div>
        <strong>{activeCount} {c.open}</strong>
      </header>

      {requests.length ? (
        <div className={styles.queue}>
          {requests.map((request) => {
            const person = peopleById.get(request.requester_id);
            const provider = request.matched_provider_id ? providersById.get(request.matched_provider_id) : null;
            return (
              <article className={styles.requestCard} key={request.id}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={`${styles.status} ${styles[`status_${request.status}`] ?? ""}`}>{request.status.replace("_", " ")}</span>
                    <span className={styles.date}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.created_at))}</span>
                  </div>
                  <strong>{request.urgency}</strong>
                </div>

                <blockquote>“{request.request_text}”</blockquote>
                <div className={styles.facts}>
                  <div><span>{c.person}</span><strong>{person?.display_name || person?.email || "WiseShare member"}</strong></div>
                  <div><span><Languages aria-hidden="true" />Language</span><strong>{request.preferred_language}</strong></div>
                  <div><span><MapPin aria-hidden="true" />Location</span><strong>{request.location || request.service_mode}</strong></div>
                  <div><span><CalendarClock aria-hidden="true" />{c.availability}</span><strong>{request.availability}</strong></div>
                </div>

                <div className={styles.assessmentGrid}>
                  <div><span>{c.assessment}</span><p>{request.assessment_summary}</p><small>{request.required_skills.join(" · ") || request.assistance_type}</small></div>
                  <div className={request.safety_level !== "volunteer_eligible" ? styles.safetyHigh : ""}><span><ShieldAlert aria-hidden="true" />{c.safety}</span><p>{labels[request.safety_level] ?? request.safety_level} → {labels[request.recommended_tier] ?? request.recommended_tier}</p><small>{request.safety_reason}</small></div>
                  <div><span><UserRoundCheck aria-hidden="true" />{c.matched}</span><p>{provider ? `${provider.display_name} · ${request.match_score}%` : "Waiting for staff review"}</p><small>{provider ? labels[provider.provider_type] : labels[request.recommended_tier]}</small></div>
                </div>

                <div className={styles.actions}>
                  {request.status !== "in_progress" && request.status !== "resolved" ? (
                    <form action={updateSupportRequestStatus.bind(null, request.id, "in_progress")}><button>{c.progress}</button></form>
                  ) : null}
                  {request.status !== "resolved" ? (
                    <form action={updateSupportRequestStatus.bind(null, request.id, "resolved")}><button className={styles.resolve}>{c.resolve}</button></form>
                  ) : null}
                  {request.status !== "escalated" && request.status !== "resolved" ? (
                    <form action={updateSupportRequestStatus.bind(null, request.id, "escalated")}><button className={styles.escalate}>{c.escalate}</button></form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className={styles.empty}>{c.empty}</p>}
    </div>
  );
}
