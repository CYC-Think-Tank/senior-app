"use client";

import Link, { useLinkStatus } from "next/link";
import { Headphones, Home, LogOut, Settings, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
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
];

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
  const chinese = locale !== "en";
  const conversationDetail =
    /^\/dashboard\/[^/]+$/.test(pathname) && !namedRoutes.includes(pathname);
  const items = [
    {
      href: "/dashboard",
      label: chinese ? "首页" : "Home",
      icon: Home,
      active: pathname === "/dashboard",
    },
    {
      href: "/dashboard/conversations",
      label: chinese ? "我的对话" : "Conversations",
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
      href: "/dashboard/settings",
      label: chinese ? "设置" : "Settings",
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
      <p className={styles.sidebarLabel}>{chinese ? "我的空间" : "My space"}</p>
      <nav className={styles.sidebarNav} aria-label={chinese ? "长辈导航" : "Senior navigation"}>
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
        <LanguageSwitcher tone="bare" />
        <AccountActions name={name} />
      </div>
    </aside>
  );
}
