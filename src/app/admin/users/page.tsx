import { requireAdmin } from "@/lib/auth";
import { personName } from "@/lib/names";
import { UserManagement, type ManagedUser } from "./user-management";
import styles from "../admin-management.module.css";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { supabase } = await requireAdmin();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("role", "family")
    .order("created_at", { ascending: false });
  const users: ManagedUser[] = (profiles ?? []).map((profile) => ({
    id: profile.id as string,
    name: personName(profile.display_name as string | null, profile.email as string),
  }));

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><p className={styles.eyebrow}>People</p><h1 className={styles.title}>Users</h1><p className={styles.intro}>A private, name-only directory of everyone with a WiseShare account.</p></div></header>
      <section className={styles.panel}>
        <div className={styles.panelTop}><h2>All users</h2><span>{users.length} total</span></div>
        <UserManagement users={users} />
      </section>
    </div>
  );
}
