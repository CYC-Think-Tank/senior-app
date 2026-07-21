import { requireUser } from "@/lib/auth";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import { personName } from "@/lib/names";
import { RouteContentEntrance } from "@/components/page-entrance";
import { SeniorSidebar } from "./senior-sidebar";
import styles from "./senior-dashboard.module.css";

export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, email")
    .eq("id", user.id)
    .single();
  const name = personName(profile?.display_name, profile?.email ?? user.email);

  return (
    <PortalShell>
      <div className={`${portalStyles.adminApp} ${styles.shell}`}>
        <SeniorSidebar name={name} />
        <div className={styles.content}>
          <main className={styles.main}>
            <div className={portalStyles.surface}>
              <RouteContentEntrance>{children}</RouteContentEntrance>
            </div>
          </main>
        </div>
      </div>
    </PortalShell>
  );
}
