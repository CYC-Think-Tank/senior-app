import Link from "next/link";
import { Play } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDuration } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Episode } from "@/lib/types";
import styles from "./feed.module.css";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const admin = createSupabaseAdminClient();
  const { data: episodes } = await admin
    .from("episodes")
    .select("*, guests(name)")
    .in("status", ["approved", "published"])
    .order("publish_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  type EpisodeRow = Episode & { guests: { name: string } };
  const rows = (episodes ?? []) as unknown as EpisodeRow[];
  const intro = locale === "en"
    ? "A growing archive of memories, laughter, and the stories that deserve to travel further."
    : "一个不断丰富的记忆、欢笑和珍贵故事档案。";

  return (
    <div className={styles.feed}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>The Fireside archive</p>
        <h1 className={styles.title}>{t("feedTitle")}</h1>
        <p className={styles.intro}>{intro}</p>
      </header>

      {rows.length === 0 ? (
        <section className={styles.empty}>
          <div><p className={styles.emptyNumber}>01</p><h2>{t("feedNoEpisodes")}</h2><p>{t("feedWait")}</p></div>
        </section>
      ) : (
        <div className={styles.episodeList}>
          {rows.map((episode, index) => (
            <Link key={episode.id} href={`/feed/${episode.id}`} className={styles.episodeCard}>
              <span className={styles.episodeNumber}>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className={styles.episodeMeta}>{episode.guests.name} · {t("commonEpisode")} {episode.episode_number}</p>
                <h2 className={styles.episodeTitle}>{episode.title}</h2>
                {episode.description ? <p className={styles.description}>{episode.description}</p> : null}
                <p className={styles.date}>{new Date(episode.publish_at ?? episode.created_at).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })} · {formatDuration(episode.duration_ms)}</p>
              </div>
              <span className={styles.play}><Play aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
