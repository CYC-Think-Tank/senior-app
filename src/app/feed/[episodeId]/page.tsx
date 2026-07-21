import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { EPISODES_BUCKET } from "@/lib/constants";
import type { Episode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EpisodePlayerPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;

  // Public page: only released episodes are visible. The status/publish_at
  // filter is the gate (no login), then the service role signs the audio URL.
  const admin = createSupabaseAdminClient();
  const { data: episode } = await admin
    .from("episodes")
    .select("*, guests(name)")
    .eq("id", episodeId)
    .in("status", ["approved", "published"])
    .lte("publish_at", new Date().toISOString())
    .single();
  if (!episode) notFound();

  const e = episode as unknown as Episode & { guests: { name: string } };
  const { data: signed } = await admin.storage
    .from(EPISODES_BUCKET)
    .createSignedUrl(e.audio_path, 60 * 60 * 6);

  const noteLines = (e.show_notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All episodes
      </Link>

      <div className="flex items-center gap-5">
        <Monogram name={e.guests.name} size="lg" />
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-ember">
            {e.guests.name} · Episode {e.episode_number}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">
            {e.title}
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            {e.publish_at
              ? new Date(e.publish_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : ""}{" "}
            · {formatDuration(e.duration_ms)}
          </p>
        </div>
      </div>

      {signed?.signedUrl ? (
        <AudioPlayer src={signed.signedUrl} durationMs={e.duration_ms} />
      ) : (
        <Card className="p-6 text-ink-soft">
          The audio isn&apos;t available right now.
        </Card>
      )}

      {e.description && (
        <p className="text-lg leading-relaxed text-ink-soft">{e.description}</p>
      )}

      {noteLines.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-3 font-serif text-xl font-semibold">
            In this episode
          </h2>
          <ul className="space-y-2 text-ink-soft">
            {noteLines.map((line, i) =>
              line.startsWith("- ") ? (
                <li key={i} className="flex gap-2">
                  <span className="text-ember">•</span>
                  <span>{line.slice(2)}</span>
                </li>
              ) : (
                <li key={i}>{line}</li>
              )
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
