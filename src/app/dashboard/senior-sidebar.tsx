"use client";

import Link, { useLinkStatus } from "next/link";
import { HandHeart, Headphones, Home, LogOut, Settings, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n";
import { signOut } from "@/app/auth/actions";
import styles from "./senior-dashboard.module.css";

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.navPending} aria-hidden="true" /> : null;
}

function AccountActions({ name }: { name: string }) {
  const { t } = useI18n();

  return (
    <div className={styles.accountActions}>
      <span className={styles.accountName}>{name}</span>
      <form action={signOut}>
        <button
          type="submit"
          className={styles.signOutButton}
          aria-label={t("commonSignOut")}
          title={t("commonSignOut")}
        >
          <LogOut aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

/** Sibling pages under /dashboard that are not a conversation's id. */
const namedRoutes = [
  "/dashboard/settings",
  "/dashboard/friends",
  "/dashboard/circle",
  "/dashboard/support",
];

const sidebarCopy: Record<Locale, {
  home: string;
  conversations: string;
  settings: string;
  support: string;
  space: string;
  navigation: string;
}> = {
  en: {
    home: "Home",
    conversations: "Conversations",
    settings: "Settings",
    support: "Get help",
    space: "My space",
    navigation: "Senior navigation",
  },
  "zh-Hans": {
    home: "首页",
    conversations: "我的对话",
    settings: "设置",
    support: "寻求帮助",
    space: "我的空间",
    navigation: "长辈导航",
  },
  "zh-Hant": {
    home: "首頁",
    conversations: "我的對話",
    settings: "設定",
    support: "尋求協助",
    space: "我的空間",
    navigation: "長輩導覽",
  },
};

export function SeniorSidebar({
  name,
  pendingRequests = 0,
}: {
  name: string;
  pendingRequests?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();
  const copy = sidebarCopy[locale];
  const conversationDetail =
    /^\/dashboard\/[^/]+$/.test(pathname) && !namedRoutes.includes(pathname);
  const items = [
    {
      href: "/dashboard",
      label: copy.home,
      icon: Home,
      active: pathname === "/dashboard",
    },
    {
      href: "/dashboard/conversations",
      label: copy.conversations,
      icon: Headphones,
      active:
        pathname.startsWith("/dashboard/conversations") || conversationDetail,
    },
    {
      // Requests are managed on /dashboard/friends, so both routes light this up.
      href: "/dashboard/circle",
      label: t("circleNavLabel"),
      icon: Users,
      active:
        pathname.startsWith("/dashboard/circle") ||
        pathname.startsWith("/dashboard/friends"),
      badge: pendingRequests,
    },
    {
      href: "/dashboard/support",
      label: copy.support,
      icon: HandHeart,
      active: pathname.startsWith("/dashboard/support"),
    },
    {
      href: "/dashboard/settings",
      label: copy.settings,
      icon: Settings,
      active: pathname.startsWith("/dashboard/settings"),
    },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarBrand}>
        <Wordmark tone="light" locale={locale} />
      </div>
      <div className={styles.mobileTools}>
        <LanguageSwitcher tone="bare" />
        <AccountActions name={name} />
      </div>
      <p className={styles.sidebarLabel}>{copy.space}</p>
      <nav className={styles.sidebarNav} aria-label={copy.navigation}>
        {items.map((item) => (
          <Link
            href={item.href}
            className={`${styles.navLink} ${item.active ? styles.navLinkActive : ""}`}
            aria-current={item.active ? "page" : undefined}
            onPointerEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            key={item.href}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
            {item.badge ? (
              // The number alone means nothing read aloud, so the label
              // carries the whole sentence.
              <span
                className={styles.navBadge}
                aria-label={
                  item.badge === 1
                    ? t("circlePendingBannerOne")
                    : t("circlePendingBanner", { count: String(item.badge) })
                }
              >
                {item.badge}
              </span>
            ) : null}
            <PendingIndicator />
          </Link>
        ))}
      </nav>
      <div className={styles.sidebarFooter}>
        <LanguageSwitcher tone="bare" openUp />
        <AccountActions name={name} />
      </div>
    </aside>
  );
}
