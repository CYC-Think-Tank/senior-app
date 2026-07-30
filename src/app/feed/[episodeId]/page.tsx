import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAudioUrl } from "@/lib/audio/encryption";
import { AudioPlayer } from "@/components/audio-player";
import { formatDuration } from "@/components/ui";
import { EPISODES_BUCKET } from "@/lib/constants";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Episode } from "@/lib/types";
import styles from "../feed.module.css";

export const dynamic = "force-dynamic";

export default async function EpisodePlayerPage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  const locale = await getPreferredLocale();
  const admin = createSupabaseAdminClient();
  const { data: episode } = await admin
    .from("episodes")
    .select("*, guests(name)")
    .eq("id", episodeId)
    .in("status", ["approved", "published"])
    .single();
  if (!episode) notFound();

  const e = episode as unknown as Episode & { guests: { name: string } };
  const audioUrl = createAudioUrl(EPISODES_BUCKET, e.audio_path, 60 * 60 * 6);
  const noteLines = (e.show_notes ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const copy = locale === "en"
    ? { back: "All episodes", archive: "From the Fireside archive", notes: "In this episode", unavailable: "The audio isn’t available right now." }
    : { back: "全部节目", archive: "来自炉边夜话档案", notes: "本期内容", unavailable: "音频暂时无法播放。" };

  return (
    <article className={styles.detail}>
      <Link href="/feed" className={styles.back}><ArrowLeft aria-hidden="true" /> {copy.back}</Link>
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>{copy.archive}</p>
        <p className={styles.episodeMeta}>{e.guests.name} · Episode {e.episode_number}</p>
        <h1 className={styles.detailTitle}>{e.title}</h1>
        <p className={styles.detailMeta}>
          {new Date(e.publish_at ?? e.created_at).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })} · {formatDuration(e.duration_ms)}
        </p>
      </header>

      <AudioPlayer src={audioUrl} durationMs={e.duration_ms} />

      {e.description || noteLines.length ? (
        <div className={`${styles.bodyGrid} ${noteLines.length ? "" : styles.bodyGridSingle}`}>
          {e.description ? <p className={styles.bodyCopy}>{e.description}</p> : <div />}
          {noteLines.length ? (
            <section className={styles.notes}>
              <h2>{copy.notes}</h2>
              <ul>{noteLines.map((line, index) => <li key={`${line}-${index}`}>{line.startsWith("- ") ? <><span className={styles.noteBullet}>• </span>{line.slice(2)}</> : line}</li>)}</ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
