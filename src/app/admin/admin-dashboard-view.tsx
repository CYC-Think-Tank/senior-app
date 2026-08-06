"use client";

import { Clock3, Mic2, Users } from "lucide-react";
import { formatDuration } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import styles from "./admin-dashboard.module.css";

export type AdminDashboardCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  totalUsers: string;
  recordingsToday: string;
  averageTime: string;
  registered: string;
  notRegistered: string;
  usersByCategory: string;
  conversationsByCategory: string;
  usage: string;
  lastSevenDays: string;
  conversations: string;
  ready: string;
  recording: string;
  pending: string;
};

export type UsagePoint = { key: string; value: number };

type Props = {
  copies: Record<string, AdminDashboardCopy>;
  totalUsers: number;
  recordingsToday: number;
  averageDurationMs: number;
  registeredUsers: number;
  unregisteredUsers: number;
  conversationCategories: { ready: number; recording: number; pending: number };
  usage: UsagePoint[];
};

type LabeledUsagePoint = UsagePoint & { label: string };

function ActivityChart({ usage }: { usage: LabeledUsagePoint[] }) {
  const width = 760;
  const height = 250;
  const left = 34;
  const right = 18;
  const top = 20;
  const bottom = 34;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(4, ...usage.map((point) => point.value));
  const points = usage.map((point, index) => ({
    ...point,
    x: left + (index / Math.max(usage.length - 1, 1)) * chartWidth,
    y: top + chartHeight - (point.value / maxValue) * chartHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${left},${top + chartHeight} ${line} ${left + chartWidth},${top + chartHeight}`;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Conversation activity over the last seven days"
    >
      <defs>
        <linearGradient id="activity-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffaf1" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#fffaf1" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((row) => {
        const y = top + (row / 3) * chartHeight;
        return <line key={row} x1={left} y1={y} x2={left + chartWidth} y2={y} className={styles.gridLine} />;
      })}
      <polygon points={area} fill="url(#activity-area)" />
      <polyline points={line} className={styles.chartLine} />
      {points.map((point) => (
        <g key={point.key}>
          <circle cx={point.x} cy={point.y} r="4.5" className={styles.chartPoint} />
          <text x={point.x} y={height - 8} textAnchor="middle" className={styles.chartLabel}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function CategoryRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total ? Math.max((value / total) * 100, value ? 4 : 0) : 0;
  return (
    <div className={styles.categoryRow}>
      <div className={styles.categoryMeta}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={styles.categoryTrack}>
        <span className={styles.categoryFill} style={{ width: `${percent}%`, background: tone }} />
      </div>
    </div>
  );
}

export function AdminDashboardView({
  copies,
  totalUsers,
  recordingsToday,
  averageDurationMs,
  registeredUsers,
  unregisteredUsers,
  conversationCategories,
  usage,
}: Props) {
  const { locale } = useI18n();
  const copy = copies[locale] ?? copies.en;
  const localizedUsage = usage.map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${point.key}T12:00:00Z`)),
  }));
  const totalConversations = Object.values(conversationCategories).reduce((total, value) => total + value, 0);
  const numberFormatter = new Intl.NumberFormat(locale);

  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
        </div>
      </header>

      <section className={styles.statsGrid} aria-label="Dashboard statistics">
        {[
          { label: copy.totalUsers, value: numberFormatter.format(totalUsers), meta: `${registeredUsers} ${copy.registered.toLowerCase()}`, icon: Users },
          { label: copy.recordingsToday, value: numberFormatter.format(recordingsToday), meta: copy.lastSevenDays, icon: Mic2 },
          { label: copy.averageTime, value: formatDuration(averageDurationMs), meta: `${numberFormatter.format(totalConversations)} ${copy.conversations}`, icon: Clock3 },
        ].map((stat) => (
          <article className={styles.statCard} key={stat.label}>
            <div className={styles.statTop}>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statIcon}><stat.icon aria-hidden="true" /></span>
            </div>
            <strong className={styles.statValue}>{stat.value}</strong>
            <span className={styles.statMeta}>{stat.meta}</span>
          </article>
        ))}
      </section>

      <section className={styles.analyticsGrid}>
        <article className={styles.chartCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{copy.usage}</h2>
              <p>{copy.lastSevenDays}</p>
            </div>
            <strong>{numberFormatter.format(localizedUsage.reduce((total, point) => total + point.value, 0))}</strong>
          </div>
          <ActivityChart usage={localizedUsage} />
        </article>

        <div className={styles.breakdowns}>
          <article className={styles.breakdownCard}>
            <div className={styles.panelHeader}>
              <div><h2>{copy.usersByCategory}</h2><p>{numberFormatter.format(totalUsers)} {copy.totalUsers.toLowerCase()}</p></div>
            </div>
            <div className={styles.categories}>
              <CategoryRow label={copy.registered} value={registeredUsers} total={totalUsers} tone="#fffaf1" />
              <CategoryRow label={copy.notRegistered} value={unregisteredUsers} total={totalUsers} tone="#f5a864" />
            </div>
          </article>
          <article className={styles.breakdownCard}>
            <div className={styles.panelHeader}>
              <div><h2>{copy.conversationsByCategory}</h2><p>{numberFormatter.format(totalConversations)} {copy.conversations}</p></div>
            </div>
            <div className={styles.categories}>
              <CategoryRow label={copy.ready} value={conversationCategories.ready} total={totalConversations} tone="#fffaf1" />
              <CategoryRow label={copy.recording} value={conversationCategories.recording} total={totalConversations} tone="#f5a864" />
              <CategoryRow label={copy.pending} value={conversationCategories.pending} total={totalConversations} tone="#d7a87d" />
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
