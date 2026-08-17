"use client";

import { useActionState, useRef } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  HandHeart,
  Languages,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { ProviderType } from "@/lib/support/matching";
import { createSupportRequest, type SupportRequestState } from "./actions";
import styles from "./support.module.css";

const initialState: SupportRequestState = { status: "idle" };

const copy = {
  en: {
    examples: [
      "I need help setting up my phone.",
      "I want someone to talk to.",
      "Can someone help me book an appointment?",
    ],
    label: "What would you like help with?",
    placeholder: "Tell us in your own words. For example: I would like someone to teach me how to use WhatsApp.",
    tryOne: "Not sure what to write? Try one of these:",
    language: "Preferred language",
    location: "Location",
    locationPlaceholder: "City or neighbourhood (optional)",
    mode: "How should you meet?",
    availability: "When are you available?",
    availabilityPlaceholder: "For example: Saturday afternoons",
    preference: "Who would you prefer?",
    either: "Virtual or nearby",
    virtual: "Virtual",
    nearby: "Nearby",
    noPreference: "Choose the best person",
    highSchool: "High-school volunteer — free",
    college: "College or university student — paid",
    staff: "Trained WiseShare staff — paid",
    submit: "Find the right person",
    submitting: "Understanding your request…",
    privacy: "Only the minimum details needed to help are shared with a matched person.",
    emergencyTitle: "This may need immediate help",
    emergencyBody: "WiseShare is not an emergency service and this request has not been monitored. Call 911 now if you or someone else may be in immediate danger.",
    staffTitle: "A trained WiseShare staff member is needed",
    staffBody: "We kept this away from student volunteers because it may involve sensitive information or a higher-risk decision. A staff member will review it.",
    matchedTitle: "We found a strong match",
    openTitle: "Your request is in the matching queue",
    openBody: "No suitable person is available in the current roster yet. WiseShare staff can review the request and help make the connection.",
    match: "match",
    available: "Available",
    skills: "Can help with",
    newRequest: "Ask for different help",
    next: "Would you like to connect? WiseShare staff will confirm the introduction before any contact details are shared.",
    error: "Something went wrong. Please try again.",
  },
  "zh-Hans": {
    examples: ["我需要帮助设置手机。", "我想找个人聊聊天。", "可以帮我预约吗？"],
    label: "您需要什么帮助？",
    placeholder: "请用您自己的话告诉我们。例如：我想请人教我使用 WhatsApp。",
    tryOne: "不知道怎么写？可以选择：",
    language: "首选语言",
    location: "地点",
    locationPlaceholder: "城市或社区（可选）",
    mode: "希望怎样见面？",
    availability: "您什么时候有空？",
    availabilityPlaceholder: "例如：星期六下午",
    preference: "您希望由谁协助？",
    either: "线上或附近见面",
    virtual: "线上",
    nearby: "附近见面",
    noPreference: "为我选择最合适的人",
    highSchool: "高中生志愿者 — 免费",
    college: "大学生 — 付费",
    staff: "受过培训的仁慧享员工 — 付费",
    submit: "寻找合适的人",
    submitting: "正在了解您的需求…",
    privacy: "只会与匹配人员分享提供帮助所需的最少信息。",
    emergencyTitle: "这可能需要立即求助",
    emergencyBody: "仁慧享不是紧急服务，此请求不会被实时监控。如果您或他人可能有危险，请立即拨打 911。",
    staffTitle: "需要受过培训的仁慧享员工",
    staffBody: "此需求可能涉及敏感信息或较高风险的决定，因此不会交给学生志愿者。工作人员会进行审核。",
    matchedTitle: "我们找到了一位合适的人选",
    openTitle: "您的需求已进入匹配队列",
    openBody: "当前人员名单中还没有合适的人选。仁慧享工作人员会审核并协助联系。",
    match: "匹配度",
    available: "时间",
    skills: "可以协助",
    newRequest: "提出其他需求",
    next: "您愿意联系吗？在分享任何联系方式之前，仁慧享工作人员会先确认介绍。",
    error: "出了点问题，请重试。",
  },
  "zh-Hant": {
    examples: ["我需要幫忙設定手機。", "我想找個人聊聊天。", "可以幫我預約嗎？"],
    label: "您需要甚麼協助？",
    placeholder: "請用您自己的話告訴我們。例如：我想請人教我使用 WhatsApp。",
    tryOne: "不知道怎樣寫？可以選擇：",
    language: "首選語言",
    location: "地點",
    locationPlaceholder: "城市或社區（選填）",
    mode: "希望怎樣見面？",
    availability: "您甚麼時候有空？",
    availabilityPlaceholder: "例如：星期六下午",
    preference: "您希望由誰協助？",
    either: "網上或附近見面",
    virtual: "網上",
    nearby: "附近見面",
    noPreference: "為我選擇最合適的人",
    highSchool: "高中生義工 — 免費",
    college: "大專或大學生 — 付費",
    staff: "受過培訓的仁慧享職員 — 付費",
    submit: "尋找合適的人",
    submitting: "正在了解您的需要…",
    privacy: "只會與配對人員分享提供協助所需的最少資料。",
    emergencyTitle: "這可能需要立即求助",
    emergencyBody: "仁慧享並非緊急服務，此請求不會被即時監察。如果您或他人可能有危險，請立即致電 911。",
    staffTitle: "需要受過培訓的仁慧享職員",
    staffBody: "此需要可能涉及敏感資料或較高風險的決定，因此不會交給學生義工。職員會進行審核。",
    matchedTitle: "我們找到了一位合適人選",
    openTitle: "您的需要已進入配對隊列",
    openBody: "目前名單中還沒有合適人選。仁慧享職員會審核並協助聯絡。",
    match: "配對度",
    available: "時間",
    skills: "可以協助",
    newRequest: "提出其他需要",
    next: "您願意聯絡嗎？在分享任何聯絡資料前，仁慧享職員會先確認介紹。",
    error: "發生問題，請再試一次。",
  },
} satisfies Record<Locale, Record<string, string | string[]>>;

function providerLabel(type: ProviderType, locale: Locale) {
  const labels: Record<Locale, Record<ProviderType, string>> = {
    en: { high_school: "High-school volunteer", college: "College or university student", staff: "Trained WiseShare staff" },
    "zh-Hans": { high_school: "高中生志愿者", college: "大学生", staff: "受过培训的仁慧享员工" },
    "zh-Hant": { high_school: "高中生義工", college: "大專或大學生", staff: "受過培訓的仁慧享職員" },
  };
  return labels[locale][type];
}

export function SupportRequestForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(createSupportRequest, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const c = copy[locale];

  if (state.status === "success") {
    const emergency = state.assessment.safetyLevel === "emergency";
    const staff = state.assessment.safetyLevel === "staff_required";
    const match = state.match;
    return (
      <section className={`${styles.resultCard} ${emergency ? styles.emergencyCard : ""}`} aria-live="polite">
        <div className={styles.resultIcon}>
          {emergency ? <TriangleAlert aria-hidden="true" /> : staff ? <ShieldCheck aria-hidden="true" /> : match ? <UserRoundCheck aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        </div>
        <div className={styles.resultBody}>
          <p className={styles.resultKicker}>WiseShare AI</p>
          <h2>{emergency ? c.emergencyTitle : staff ? c.staffTitle : match ? c.matchedTitle : c.openTitle}</h2>
          <p className={styles.resultSummary}>
            {emergency ? c.emergencyBody : staff ? c.staffBody : match ? state.assessment.summary : c.openBody}
          </p>

          {match ? (
            <article className={styles.matchCard}>
              <div className={styles.matchAvatar}>{match.provider.displayName.slice(0, 1).toUpperCase()}</div>
              <div className={styles.matchMain}>
                <div className={styles.matchHeading}>
                  <div>
                    <h3>{match.provider.displayName}</h3>
                    <p>{providerLabel(match.provider.providerType, locale)}</p>
                  </div>
                  <strong>{match.score}% {c.match}</strong>
                </div>
                <dl className={styles.matchDetails}>
                  <div><dt><Languages aria-hidden="true" />{c.language}</dt><dd>{match.provider.languages.join(", ")}</dd></div>
                  <div><dt><CalendarClock aria-hidden="true" />{c.available}</dt><dd>{match.provider.availability}</dd></div>
                  <div><dt><HandHeart aria-hidden="true" />{c.skills}</dt><dd>{match.provider.skills.join(", ")}</dd></div>
                </dl>
              </div>
            </article>
          ) : null}

          {!emergency && match ? <p className={styles.nextStep}><Check aria-hidden="true" />{c.next}</p> : null}
          <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>
            {c.newRequest}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form action={action} className={styles.formCard}>
      <div className={styles.field}>
        <label htmlFor="support-request">{c.label}</label>
        <textarea
          ref={textareaRef}
          id="support-request"
          name="request"
          rows={5}
          maxLength={2000}
          placeholder={c.placeholder as string}
          required
        />
        <p className={styles.exampleLabel}>{c.tryOne}</p>
        <div className={styles.examples}>
          {(c.examples as string[]).map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                if (textareaRef.current) {
                  textareaRef.current.value = example;
                  textareaRef.current.focus();
                }
              }}
            >
              “{example}”
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span><Languages aria-hidden="true" />{c.language}</span>
          <select name="language" defaultValue={locale === "zh-Hant" ? "Cantonese" : locale === "zh-Hans" ? "Mandarin" : "English"}>
            <option>English</option><option>Cantonese</option><option>Mandarin</option><option>French</option><option>Other</option>
          </select>
        </label>
        <label className={styles.field}>
          <span><MapPin aria-hidden="true" />{c.location}</span>
          <input name="location" maxLength={160} placeholder={c.locationPlaceholder as string} />
        </label>
        <label className={styles.field}>
          <span><HandHeart aria-hidden="true" />{c.mode}</span>
          <select name="mode" defaultValue="either">
            <option value="either">{c.either}</option><option value="virtual">{c.virtual}</option><option value="nearby">{c.nearby}</option>
          </select>
        </label>
        <label className={styles.field}>
          <span><CalendarClock aria-hidden="true" />{c.availability}</span>
          <input name="availability" maxLength={240} placeholder={c.availabilityPlaceholder as string} required />
        </label>
      </div>

      <label className={styles.field}>
        <span><UserRoundCheck aria-hidden="true" />{c.preference}</span>
        <select name="preference" defaultValue="no_preference">
          <option value="no_preference">{c.noPreference}</option>
          <option value="high_school">{c.highSchool}</option>
          <option value="college">{c.college}</option>
          <option value="staff">{c.staff}</option>
        </select>
      </label>

      {state.status === "error" ? <p className={styles.formError} role="alert">{state.message || c.error}</p> : null}
      <div className={styles.formFooter}>
        <p><ShieldCheck aria-hidden="true" />{c.privacy}</p>
        <button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {pending ? c.submitting : c.submit}
          {!pending ? <ArrowRight aria-hidden="true" /> : null}
        </button>
      </div>
    </form>
  );
}
