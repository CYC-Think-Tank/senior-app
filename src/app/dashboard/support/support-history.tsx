import { Check, Clock3, LifeBuoy, UserRoundCheck } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { submitSupportFollowUp } from "./actions";
import styles from "./support.module.css";

export type SupportHistoryItem = {
  id: string;
  summary: string;
  status: string;
  providerName: string | null;
  createdAt: string;
};

const copy: Record<Locale, {
  title: string; empty: string; helper: string; waiting: string; followUp: string;
  yes: string; no: string; statuses: Record<string, string>;
}> = {
  en: {
    title: "Your help requests", empty: "Your requests will appear here.", helper: "Matched with", waiting: "WiseShare is looking for the right person.", followUp: "Was your issue resolved?", yes: "Yes, it was resolved", no: "No, I still need help",
    statuses: { open: "Matching", matched: "Match found", accepted: "Accepted", in_progress: "In progress", resolved: "Resolved", escalated: "Staff review" },
  },
  "zh-Hans": {
    title: "您的帮助请求", empty: "您的请求会显示在这里。", helper: "匹配人员", waiting: "慧享正在寻找合适的人。", followUp: "您的问题解决了吗？", yes: "是的，已解决", no: "没有，我仍需帮助",
    statuses: { open: "正在匹配", matched: "已找到人选", accepted: "已接受", in_progress: "处理中", resolved: "已解决", escalated: "员工审核" },
  },
  "zh-Hant": {
    title: "您的協助請求", empty: "您的請求會顯示在這裡。", helper: "配對人員", waiting: "慧享正在尋找合適的人。", followUp: "您的問題解決了嗎？", yes: "是的，已解決", no: "沒有，我仍需協助",
    statuses: { open: "正在配對", matched: "已找到人選", accepted: "已接受", in_progress: "處理中", resolved: "已解決", escalated: "職員審核" },
  },
};

export function SupportHistory({ items, locale }: { items: SupportHistoryItem[]; locale: Locale }) {
  const c = copy[locale];
  return (
    <section className={styles.historySection} aria-labelledby="support-history-title">
      <h2 id="support-history-title">{c.title}</h2>
      {items.length ? (
        <div className={styles.historyList}>
          {items.map((item) => {
            const canFollowUp = ["matched", "accepted", "in_progress"].includes(item.status);
            return (
              <article className={styles.historyItem} key={item.id}>
                <div className={styles.historyIcon}>
                  {item.status === "resolved" ? <Check aria-hidden="true" /> : item.providerName ? <UserRoundCheck aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                </div>
                <div className={styles.historyMain}>
                  <div className={styles.historyTop}>
                    <strong>{item.summary}</strong>
                    <span>{c.statuses[item.status] ?? item.status}</span>
                  </div>
                  <p>{item.providerName ? `${c.helper} ${item.providerName}` : c.waiting}</p>
                  <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</time>
                  {canFollowUp ? (
                    <div className={styles.followUp}>
                      <p>{c.followUp}</p>
                      <div>
                        <form action={submitSupportFollowUp.bind(null, item.id, true)}><button><Check aria-hidden="true" />{c.yes}</button></form>
                        <form action={submitSupportFollowUp.bind(null, item.id, false)}><button className={styles.needsHelp}><LifeBuoy aria-hidden="true" />{c.no}</button></form>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className={styles.historyEmpty}>{c.empty}</p>}
    </section>
  );
}
