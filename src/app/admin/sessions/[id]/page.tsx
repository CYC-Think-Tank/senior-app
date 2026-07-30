import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAudioUrl } from "@/lib/audio/encryption";
import { RAW_BUCKET } from "@/lib/constants";
import type { Episode, Guest, InterviewSession, TranscriptTurn } from "@/lib/types";
import TranscriptEditor from "./transcript-editor";

export const dynamic = "force-dynamic";

export default async function SessionEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const [{ data: session }, { data: turns }, { data: episode }] =
    await Promise.all([
      supabase.from("sessions").select("*, guests(*)").eq("id", id).single(),
      supabase
        .from("transcript_turns")
        .select("*")
        .eq("session_id", id)
        .order("idx"),
      supabase.from("episodes").select("*").eq("session_id", id).maybeSingle(),
    ]);

  if (!session) notFound();

  const audioUrl = session.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 2)
    : null;

  return (
    <TranscriptEditor
      session={session as unknown as InterviewSession}
      guest={session.guests as unknown as Guest}
      initialTurns={(turns ?? []) as TranscriptTurn[]}
      episode={(episode ?? null) as Episode | null}
      audioUrl={audioUrl}
    />
  );
}
