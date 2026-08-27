import { CalendarClock, Languages, MapPin, ShieldAlert, UserRoundCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Locale } from "@/lib/i18n";
import { setProviderApproval, updateSupportRequestStatus } from "./actions";
import { SyncRegistrations } from "./sync-registrations";
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

type ProviderRow = {
  id: string;
  display_name: string;
  provider_type: string;
  email: string;
  phone: string;
  school: string;
  grade: string;
  locations: string[];
  verified: boolean;
  active: boolean;
  synced_at: string | null;
};

const copy: Record<Locale, {
  eyebrow: string; title: string; intro: string; empty: string; open: string;
  person: string; assessment: string; safety: string; availability: string;
  matched: string; progress: string; resolve: string; escalate: string;
  rosterTitle: string; rosterIntro: string; rosterEmpty: string; sync: string;
  syncing: string; synced: string; verify: string; pause: string;
  awaiting: string; matching: string;
}> = {
  en: {
    eyebrow: "AI-assisted support desk", title: "Human support queue", intro: "Review new needs, supervise AI matches, and keep sensitive requests with trained staff.", empty: "No support requests yet.", open: "active requests", person: "Requested by", assessment: "AI assessment", safety: "Safety route", availability: "Availability", matched: "Matched helper", progress: "Mark in progress", resolve: "Resolve", escalate: "Escalate", rosterTitle: "Senior Care sign-ups", rosterIntro: "Students who chose Senior Care when registering on thecyc.org. Verify someone to let WiseShare match them with a senior.", rosterEmpty: "No Senior Care sign-ups have been imported yet.", sync: "Sync from thecyc.org", syncing: "Syncing…", synced: "Imported", verify: "Verify & activate", pause: "Pause", awaiting: "Awaiting verification", matching: "Matching",
  },
  "zh-Hans": {
    eyebrow: "AI 辅助支持台", title: "人工支持队列", intro: "审核新需求、监督 AI 匹配，并确保敏感请求由受训员工处理。", empty: "目前没有支持请求。", open: "个进行中请求", person: "请求人", assessment: "AI 评估", safety: "安全分流", availability: "可用时间", matched: "匹配人员", progress: "标记处理中", resolve: "标记已解决", escalate: "升级处理", rosterTitle: "长者关怀报名", rosterIntro: "在 thecyc.org 注册时选择「长者关怀」的学生。通过审核后，WiseShare 才会为长者匹配他们。", rosterEmpty: "尚未导入任何长者关怀报名。", sync: "从 thecyc.org 同步", syncing: "同步中…", synced: "已导入", verify: "审核并启用", pause: "暂停", awaiting: "等待审核", matching: "可匹配",
  },
  "zh-Hant": {
    eyebrow: "AI 輔助支援台", title: "人工支援隊列", intro: "審核新需要、監督 AI 配對，並確保敏感請求由受訓職員處理。", empty: "目前沒有支援請求。", open: "個進行中請求", person: "請求人", assessment: "AI 評估", safety: "安全分流", availability: "可用時間", matched: "配對人員", progress: "標記處理中", resolve: "標記已解決", escalate: "升級處理", rosterTitle: "長者關懷報名", rosterIntro: "在 thecyc.org 註冊時選擇「長者關懷」的學生。通過審核後，WiseShare 才會為長者配對他們。", rosterEmpty: "尚未匯入任何長者關懷報名。", sync: "從 thecyc.org 同步", syncing: "同步中…", synced: "已匯入", verify: "審核並啟用", pause: "暫停", awaiting: "等待審核", matching: "可配對",
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
  const admin = createSupabaseAdminClient();
  const { data: rows } = await admin
    .from("support_requests")
    .select("id, requester_id, request_text, assistance_type, urgency, preferred_language, location, service_mode, availability, required_skills, safety_level, recommended_tier, assessment_summary, safety_reason, matched_provider_id, match_score, status, created_at")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  const requests = (rows ?? []) as RequestRow[];
  const { data: rosterRows } = await admin
    .from("support_providers")
    .select("id, display_name, provider_type, email, phone, school, grade, locations, verified, active, synced_at")
    .eq("source", "cyc_registration")
    .order("verified", { ascending: true })
    .order("display_name");
  const roster = (rosterRows ?? []) as ProviderRow[];
  const requesterIds = [...new Set(requests.map((request) => request.requester_id))];
  const providerIds = [...new Set(requests.map((request) => request.matched_provider_id).filter((id): id is string => Boolean(id)))];
  const [{ data: people }, { data: providers }] = await Promise.all([
    requesterIds.length
      ? admin.from("profiles").select("id, display_name, email").in("id", requesterIds)
      : Promise.resolve({ data: [] }),
    providerIds.length
      ? admin.from("support_providers").select("id, display_name, provider_type").in("id", providerIds)
      : Promise.resolve({ data: [] }),
  ]);
  const peopleById = new Map((people ?? []).map((person) => [person.id, person]));
  const providersById = new Map((providers ?? []).map((provider) => [provider.id, provider]));
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

      <section className={styles.roster}>
        <header className={styles.rosterHeader}>
          <div>
            <h2>{c.rosterTitle}</h2>
            <p>{c.rosterIntro}</p>
          </div>
          <SyncRegistrations
            label={c.sync}
            pendingLabel={c.syncing}
            summary={(result) =>
              `${c.synced}: +${result.created} · ${result.updated} · ${result.fetched}`
            }
          />
        </header>

        {roster.length ? (
          <ul className={styles.rosterList}>
            {roster.map((provider) => {
              const live = provider.verified && provider.active;
              return (
                <li key={provider.id}>
                  <div className={styles.rosterPerson}>
                    <strong>{provider.display_name}</strong>
                    <small>
                      {[labels[provider.provider_type] ?? provider.provider_type,
                        provider.school,
                        provider.grade && `Grade ${provider.grade}`,
                        provider.locations[0]]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <div className={styles.rosterContact}>
                    <span>{provider.email}</span>
                    <span>{provider.phone}</span>
                  </div>
                  <span className={live ? styles.rosterLive : styles.rosterPending}>
                    {live ? c.matching : c.awaiting}
                  </span>
                  <form action={setProviderApproval.bind(null, provider.id, !live)}>
                    <button className={live ? "" : styles.resolve}>
                      {live ? c.pause : c.verify}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : <p className={styles.empty}>{c.rosterEmpty}</p>}
      </section>
    </div>
  );
}
