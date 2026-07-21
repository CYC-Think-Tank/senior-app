import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import { AdminSidebar } from "./admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <PortalShell>
      <div className={portalStyles.adminApp}>
        <AdminSidebar
          dashboardLabel={t("commonDashboard")}
          guestsLabel={t("commonGuests")}
          usersLabel={
            locale === "en" ? "Users" : locale === "zh-Hans" ? "用户" : "使用者"
          }
          participationLabel={
            locale === "en"
              ? "Invites & requests"
              : locale === "zh-Hans"
                ? "邀请与申请"
                : "邀請與申請"
          }
          feedLabel={t("commonViewFeed")}
          signOutLabel={t("commonSignOut")}
        />
        <div className={portalStyles.adminContent}>
          <main className={portalStyles.adminMain}>
            <div className={portalStyles.surface}>{children}</div>
          </main>
        </div>
      </div>
    </PortalShell>
  );
}
