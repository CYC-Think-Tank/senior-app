"use client";

import Link from "next/link";
import { LayoutDashboard, LogOut, Radio, Send, UserRound, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { portalStyles } from "@/components/portal-shell";
import { Wordmark } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { signOut } from "@/app/auth/actions";

type Props = {
  dashboardLabel: string;
  guestsLabel: string;
  usersLabel: string;
  participationLabel: string;
  feedLabel: string;
  signOutLabel: string;
};

export function AdminSidebar({ dashboardLabel, guestsLabel, usersLabel, participationLabel, feedLabel, signOutLabel }: Props) {
  const pathname = usePathname();
  const items = [
    {
      href: "/admin",
      label: dashboardLabel,
      icon: LayoutDashboard,
      active: pathname === "/admin",
    },
    {
      href: "/admin/guests",
      label: guestsLabel,
      icon: UsersRound,
      active: pathname.startsWith("/admin/guests"),
    },
    {
      href: "/admin/users",
      label: usersLabel,
      icon: UserRound,
      active: pathname.startsWith("/admin/users"),
    },
    {
      href: "/admin/participation",
      label: participationLabel,
      icon: Send,
      active: pathname.startsWith("/admin/participation"),
    },
    {
      href: "/feed",
      label: feedLabel,
      icon: Radio,
      active: pathname.startsWith("/feed"),
    },
  ];

  return (
    <aside className={portalStyles.adminSidebar}>
      <div className={portalStyles.sidebarBrand}><Wordmark href="/admin" tone="light" /></div>
      <p className={portalStyles.sidebarLabel}>Workspace</p>
      <nav className={portalStyles.sidebarNav} aria-label="Admin navigation">
        {items.map((item) => (
          <Link
            href={item.href}
            className={`${portalStyles.sidebarLink} ${
              item.active ? portalStyles.sidebarLinkActive : ""
            }`}
            aria-current={item.active ? "page" : undefined}
            key={item.href}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className={portalStyles.sidebarFooter}>
        <LanguageSwitcher tone="bare" />
        <form action={signOut}>
          <button className={portalStyles.sidebarUtility}>
            <LogOut aria-hidden="true" />
            <span>{signOutLabel}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
