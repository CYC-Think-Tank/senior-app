"use client";

import Link, { useLinkStatus } from "next/link";
import { LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { portalStyles } from "@/components/portal-shell";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { signOut } from "@/app/auth/actions";
import { useI18n } from "@/components/i18n-provider";

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className={portalStyles.sidebarPending} aria-hidden="true" /> : null;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();
  const workspace = locale === "en" ? "Workspace" : locale === "zh-Hans" ? "工作区" : "工作區";
  const navigation = locale === "en" ? "Admin navigation" : locale === "zh-Hans" ? "管理员导航" : "管理員導覽";
  const items = [
    {
      href: "/admin",
      label: t("commonDashboard"),
      icon: LayoutDashboard,
      active: pathname === "/admin",
    },
    {
      href: "/admin/users",
      label: locale === "en" ? "Users" : locale === "zh-Hans" ? "用户" : "使用者",
      icon: UserRound,
      active: pathname.startsWith("/admin/users"),
    },
  ];

  return (
    <aside className={portalStyles.adminSidebar}>
      <div className={portalStyles.sidebarBrand}><Wordmark tone="light" locale={locale} /></div>
      <p className={portalStyles.sidebarLabel}>{workspace}</p>
      <nav className={portalStyles.sidebarNav} aria-label={navigation}>
        {items.map((item) => (
          <Link
            href={item.href}
            className={`${portalStyles.sidebarLink} ${
              item.active ? portalStyles.sidebarLinkActive : ""
            }`}
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
      <div className={portalStyles.sidebarFooter}>
        <LanguageSwitcher tone="bare" openUp />
        <form action={signOut}>
          <button className={portalStyles.sidebarUtility}>
            <LogOut aria-hidden="true" />
            <span>{t("commonSignOut")}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
