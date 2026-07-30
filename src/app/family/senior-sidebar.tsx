"use client";

import Link, { useLinkStatus } from "next/link";
import { Headphones, Home, LogOut, MessageSquareText, Settings } from "lucide-react";
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

/** Sibling pages under /family that are not a conversation's id. */
const namedRoutes = ["/family/requests", "/family/settings"];

export function SeniorSidebar({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
  const conversationDetail =
    /^\/family\/[^/]+$/.test(pathname) && !namedRoutes.includes(pathname);
  const items = [
    {
      href: "/family",
      label: chinese ? "首页" : "Home",
      icon: Home,
      active: pathname === "/family",
    },
    {
      href: "/family/conversations",
      label: chinese ? "我的对话" : "Conversations",
      icon: Headphones,
      active: pathname.startsWith("/family/conversations") || conversationDetail,
    },
    {
      href: "/family/requests",
      label: chinese ? "播客申请" : "Podcast requests",
      icon: MessageSquareText,
      active: pathname.startsWith("/family/requests"),
    },
    {
      href: "/family/settings",
      label: chinese ? "设置" : "Settings",
      icon: Settings,
      active: pathname.startsWith("/family/settings"),
    },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarBrand}>
        <Wordmark tone="light" name={chinese ? "慧仁享" : undefined} />
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
