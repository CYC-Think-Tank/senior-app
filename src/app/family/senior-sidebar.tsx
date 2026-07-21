"use client";

import Link, { useLinkStatus } from "next/link";
import { Headphones, Home, MessageSquareText } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { Wordmark } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import styles from "./senior-dashboard.module.css";

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.navPending} aria-hidden="true" /> : null;
}

export function SeniorSidebar({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
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
      active:
        pathname.startsWith("/family/conversations") ||
        (/^\/family\/[^/]+$/.test(pathname) && pathname !== "/family/requests"),
    },
    {
      href: "/family/requests",
      label: chinese ? "播客申请" : "Podcast requests",
      icon: MessageSquareText,
      active: pathname.startsWith("/family/requests"),
    },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarBrand}>
        <Wordmark tone="light" />
      </div>
      <div className={styles.mobileTools}>
        <LanguageSwitcher tone="bare" />
        <UserMenu name={name} tone="dark" />
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
        <UserMenu name={name} tone="dark" />
      </div>
    </aside>
  );
}
