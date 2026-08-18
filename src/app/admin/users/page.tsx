import { requireAdmin } from "@/lib/auth";
import { personName } from "@/lib/names";
import { UserManagement, type ManagedUser } from "./user-management";
import { getPreferredLocale } from "@/lib/preferred-locale";
import styles from "../admin-management.module.css";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [{ supabase }, locale] = await Promise.all([
    requireAdmin(),
    getPreferredLocale(),
  ]);
  const copy = locale === "en"
    ? { eyebrow: "People", title: "Users", intro: "A private, name-only directory of everyone with a WiseShare account.", all: "All users", total: "total" }
    : locale === "zh-Hans"
      ? { eyebrow: "人员", title: "用户", intro: "所有慧享账户的私密姓名目录。", all: "所有用户", total: "人" }
      : { eyebrow: "人員", title: "使用者", intro: "所有慧享帳戶的私人姓名目錄。", all: "所有使用者", total: "人" };
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
      <header className={styles.header}><div><p className={styles.eyebrow}>{copy.eyebrow}</p><h1 className={styles.title}>{copy.title}</h1><p className={styles.intro}>{copy.intro}</p></div></header>
      <section className={styles.panel}>
        <div className={styles.panelTop}><h2>{copy.all}</h2><span>{users.length} {copy.total}</span></div>
        <UserManagement users={users} />
      </section>
    </div>
  );
}
