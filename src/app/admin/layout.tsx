import { requireAdmin } from "@/lib/auth";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import { AdminSidebar } from "./admin-sidebar";
import { RouteContentEntrance } from "@/components/page-entrance";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <PortalShell>
      <div className={portalStyles.adminApp}>
        <AdminSidebar />
        <div className={portalStyles.adminContent}>
          <main className={portalStyles.adminMain}>
            <div className={portalStyles.surface}>
              <RouteContentEntrance>{children}</RouteContentEntrance>
            </div>
          </main>
        </div>
      </div>
    </PortalShell>
  );
}
