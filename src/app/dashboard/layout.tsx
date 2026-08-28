import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import { personName } from "@/lib/names";
import { RouteContentEntrance } from "@/components/page-entrance";
import { SeniorSidebar } from "./senior-sidebar";
import { getPendingRequestCount } from "./friends/friends-data";
import styles from "./senior-dashboard.module.css";

export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const [profile] = await db
    .select({ displayName: profiles.displayName, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const name = personName(profile?.displayName, profile?.email ?? user.email);
  // Drives the badge on the Friend circle nav item; accepting or declining a
  // request revalidates this layout so it clears.
  const pendingRequests = await getPendingRequestCount();

  return (
    <PortalShell>
      <div className={`${portalStyles.adminApp} ${styles.shell}`}>
        <SeniorSidebar name={name} pendingRequests={pendingRequests} />
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
