import { requireAdmin } from "@/lib/auth";
import { personName } from "@/lib/names";
import { invitePodcastUser } from "@/app/admin/actions";
import styles from "../admin-management.module.css";

export const dynamic = "force-dynamic";

const steps = ["Requested", "Invited", "Accepted", "Interview done"];
const statusIndex: Record<string, number> = { requested: 0, invited: 1, accepted: 2, interview_done: 3 };

export default async function ParticipationPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("podcast_participation")
    .select("id, user_id, source, status, updated_at, profiles(display_name, email)")
    .order("updated_at", { ascending: false });
  type Row = { id: string; user_id: string; source: string; status: string; updated_at: string; profiles: { display_name: string | null; email: string } };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><p className={styles.eyebrow}>Public podcast</p><h1 className={styles.title}>Invites &amp; requests</h1><p className={styles.intro}>Follow every invitation from the first request through the completed interview.</p></div></header>
      <section className={styles.panel}>
        <div className={styles.panelTop}><h2>Participation</h2><span>{rows.length} active records</span></div>
        <div className={styles.participationList}>
          {rows.length ? rows.map((row) => {
            const current = statusIndex[row.status] ?? 0;
            const name = personName(row.profiles.display_name, row.profiles.email);
            return (
              <div className={styles.participationRow} key={row.id}>
                <div><strong className={styles.name}>{name}</strong><span className={styles.source}>{row.source === "request" ? "Requested to join" : "Invited by admin"}</span></div>
                <div className={styles.progress} aria-label={`Progress: ${steps[current]}`}>
                  {steps.map((step, index) => <span className={`${styles.step} ${index <= current ? styles.stepComplete : ""}`} key={step}>{step}</span>)}
                </div>
                {row.status === "requested" ? <form action={invitePodcastUser.bind(null, row.user_id)}><button className={styles.inviteButton}>Send invite</button></form> : <span className={styles.status}>{steps[current]}</span>}
              </div>
            );
          }) : <p className={styles.empty}>No invitations or requests yet.</p>}
        </div>
      </section>
    </div>
  );
}
