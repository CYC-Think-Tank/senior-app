import { requireAdmin } from "@/lib/auth";
import { personName } from "@/lib/names";
import { UserManagement, type ManagedUser } from "./user-management";
import styles from "../admin-management.module.css";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { supabase } = await requireAdmin();
  const [{ data: profiles }, { data: participation }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, email").eq("role", "family").order("created_at", { ascending: false }),
    supabase.from("podcast_participation").select("user_id, status"),
  ]);
  const statusByUser = new Map((participation ?? []).map((row) => [row.user_id as string, row.status as string]));
  const users: ManagedUser[] = (profiles ?? []).map((profile) => ({
    id: profile.id as string,
    name: personName(profile.display_name as string | null, profile.email as string),
    participationStatus: statusByUser.get(profile.id as string) ?? null,
  }));

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><p className={styles.eyebrow}>People</p><h1 className={styles.title}>Users</h1><p className={styles.intro}>A private, name-only directory. Invite someone to record for the public podcast or remove their account.</p></div></header>
      <section className={styles.panel}>
        <div className={styles.panelTop}><h2>All users</h2><span>{users.length} total</span></div>
        <UserManagement users={users} />
      </section>
    </div>
  );
}
