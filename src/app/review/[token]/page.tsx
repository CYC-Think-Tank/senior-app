import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAudioUrl } from "@/lib/audio/encryption";
import { EPISODES_BUCKET } from "@/lib/constants";
import type { Episode, Guest } from "@/lib/types";
import ReviewPlayer from "./review-player";

// Token-gated senior approval page — no login required.
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: episode } = await admin
    .from("episodes")
    .select("*, guests(name)")
    .eq("review_token", token)
    .single();
  if (!episode) notFound();

  const e = episode as unknown as Episode & { guests: Pick<Guest, "name"> };

  const audioUrl = createAudioUrl(EPISODES_BUCKET, e.audio_path, 60 * 60 * 6);

  return (
    <ReviewPlayer
      token={token}
      guestName={e.guests.name}
      title={e.title}
      episodeNumber={e.episode_number}
      status={e.status}
      audioUrl={audioUrl}
    />
  );
}
