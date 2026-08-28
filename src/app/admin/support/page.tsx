import { CalendarClock, Languages, MapPin, ShieldAlert, UserRoundCheck } from "lucide-react";
import { asc, desc, eq, inArray, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { profiles, supportProviders, supportRequests } from "@/lib/db/schema";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Locale } from "@/lib/i18n";
import { setProviderApproval, updateSupportRequestStatus } from "./actions";
import { SyncRegistrations } from "./sync-registrations";
import styles from "./support-admin.module.css";

export const dynamic = "force-dynamic";

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
  // The whole queue, staff-only: the "admins manage support requests" and
  // "admins manage support providers" policies were admin-or-nothing, and
  // requireAdmin above is the whole of that check now.
  const requests = await db
    .select()
    .from(supportRequests)
    .where(ne(supportRequests.status, "cancelled"))
    .orderBy(desc(supportRequests.createdAt));

  const roster = await db
    .select()
    .from(supportProviders)
    .where(eq(supportProviders.source, "cyc_registration"))
    .orderBy(asc(supportProviders.verified), asc(supportProviders.displayName));

  const requesterIds = [...new Set(requests.map((request) => request.requesterId))];
  const providerIds = [...new Set(requests.map((request) => request.matchedProviderId).filter((id): id is string => Boolean(id)))];
  const [people, providers] = await Promise.all([
    requesterIds.length
      ? db
          .select({ id: profiles.id, displayName: profiles.displayName, email: profiles.email })
          .from(profiles)
          .where(inArray(profiles.id, requesterIds))
      : [],
    providerIds.length
      ? db
          .select({ id: supportProviders.id, displayName: supportProviders.displayName, providerType: supportProviders.providerType })
          .from(supportProviders)
          .where(inArray(supportProviders.id, providerIds))
      : [],
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
            const person = peopleById.get(request.requesterId);
            const provider = request.matchedProviderId ? providersById.get(request.matchedProviderId) : null;
            return (
              <article className={styles.requestCard} key={request.id}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={`${styles.status} ${styles[`status_${request.status}`] ?? ""}`}>{request.status.replace("_", " ")}</span>
                    <span className={styles.date}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</span>
                  </div>
                  <strong>{request.urgency}</strong>
                </div>

                <blockquote>“{request.requestText}”</blockquote>
                <div className={styles.facts}>
                  <div><span>{c.person}</span><strong>{person?.displayName || person?.email || "WiseShare member"}</strong></div>
                  <div><span><Languages aria-hidden="true" />Language</span><strong>{request.preferredLanguage}</strong></div>
                  <div><span><MapPin aria-hidden="true" />Location</span><strong>{request.location || request.serviceMode}</strong></div>
                  <div><span><CalendarClock aria-hidden="true" />{c.availability}</span><strong>{request.availability}</strong></div>
                </div>

                <div className={styles.assessmentGrid}>
                  <div><span>{c.assessment}</span><p>{request.assessmentSummary}</p><small>{request.requiredSkills.join(" · ") || request.assistanceType}</small></div>
                  <div className={request.safetyLevel !== "volunteer_eligible" ? styles.safetyHigh : ""}><span><ShieldAlert aria-hidden="true" />{c.safety}</span><p>{labels[request.safetyLevel] ?? request.safetyLevel} → {labels[request.recommendedTier] ?? request.recommendedTier}</p><small>{request.safetyReason}</small></div>
                  <div><span><UserRoundCheck aria-hidden="true" />{c.matched}</span><p>{provider ? `${provider.displayName} · ${request.matchScore}%` : "Waiting for staff review"}</p><small>{provider ? labels[provider.providerType] : labels[request.recommendedTier]}</small></div>
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
                    <strong>{provider.displayName}</strong>
                    <small>
                      {[labels[provider.providerType] ?? provider.providerType,
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
