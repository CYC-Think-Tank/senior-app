import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { resumeConversation } from "@/app/dashboard/actions";
import { createAudioUrl } from "@/lib/audio/encryption";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET } from "@/lib/constants";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { conversationNames } from "@/lib/names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptTurns } from "@/lib/transcript/encryption";
import { CommentThread } from "../circle/comment-thread";
import { getConversationComments } from "../circle/circle-data";
import type { Guest, InterviewSession, TranscriptTurn } from "@/lib/types";
import type { ConversationVideo } from "@/lib/types";
import { publicConversationVideo } from "@/lib/memoir/workflow";
import { MemoirVideoCard } from "./memoir-video-card";
import { ConversationTranscriptEditor } from "./transcript-editor";

export const dynamic = "force-dynamic";

export default async function FamilyConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase, user } = await requireUser();
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  // Read through the user's client so RLS keeps this inside the family; the
  // service role is only used afterwards to sign the audio URL. The siblings
  // come along so an unnamed conversation gets the same number as the list.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("*, guests(name)")
    .in("status", ["ready", "recording"]);

  type SessionRow = InterviewSession & { guests: Pick<Guest, "name"> };
  const all = (sessions ?? []) as unknown as SessionRow[];
  const s = all.find((row) => row.id === sessionId);
  if (!s) notFound();

  const name =
    conversationNames(all, (number) =>
      t("familyConversationNumbered", { number })
    ).get(s.id) ?? "";

  const audioUrl = s.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, s.raw_audio_path, 60 * 60 * 6)
    : null;

  const finished = s.status === "ready";
  // Transcript rows are intentionally absent from family RLS. The session read
  // above proved this is the caller's own conversation before the service role
  // fetches and decrypts its editable lines.
  const admin = createSupabaseAdminClient();
  const { data: turnRows } = finished
    ? await admin
        .from("transcript_turns")
        .select("*")
        .eq("session_id", s.id)
        .order("idx")
    : { data: [] };
  const turns = finished
    ? decryptTurns(s.id, (turnRows ?? []) as TranscriptTurn[])
    : [];
  const cuts = turns
    .filter((turn) => turn.excluded)
    .map((turn) => ({ startMs: turn.start_ms, endMs: turn.end_ms }));
  const editedDuration = editedAudioDurationMs(s.duration_ms, cuts);

  const { data: videoRow } = finished
    ? await supabase
        .from("conversation_videos")
        .select("*")
        .eq("session_id", s.id)
        .maybeSingle()
    : { data: null };
  const initialVideo = videoRow
    ? await publicConversationVideo(videoRow as ConversationVideo)
    : null;

  // Only finished conversations can be shared, and the comment thread is only
  // worth showing once there is a circle that could have written in it.
  const { data: share } = finished
    ? await supabase
        .from("circle_shares")
        .select("session_id")
        .eq("session_id", sessionId)
        .maybeSingle()
    : { data: null };
  const sharedWithCircle = Boolean(share);
  const comments = finished ? await getConversationComments(sessionId) : [];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/conversations"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {t("familyAllConversations")}
      </Link>

      <div className="flex items-center gap-5">
        <Monogram name={s.guests.name} size="lg" />
        <div>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
            {name}
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            {new Date(s.created_at).toLocaleDateString(locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · {formatDuration(editedDuration)}
          </p>
        </div>
      </div>

      {finished ? (
        <ConversationTranscriptEditor
          sessionId={s.id}
          guestName={s.guests.name}
          initialTurns={turns}
          audioUrl={audioUrl}
          durationMs={s.duration_ms}
        />
      ) : audioUrl ? (
        <AudioPlayer src={audioUrl} durationMs={s.duration_ms} />
      ) : s.status === "recording" ? (
        <Card className="space-y-4 p-6">
          <p className="text-ink-soft">{t("familyUnfinishedNote")}</p>
          <form action={resumeConversation.bind(null, s.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2 font-medium text-cream transition-colors hover:bg-ember-deep"
            >
              <Mic className="h-4 w-4" /> {t("familyContinue")}
            </button>
          </form>
        </Card>
      ) : (
        <Card className="p-6 text-ink-soft">{t("audioMissing")}</Card>
      )}

      {finished ? (
        <MemoirVideoCard sessionId={s.id} initialVideo={initialVideo} />
      ) : null}

      {/* Sharing is switched from the Friends button in the conversations
          table, so this page only shows what the circle has said back. */}
      {finished && (sharedWithCircle || comments.length) ? (
        <CommentThread
          sessionId={s.id}
          comments={comments}
          viewerId={user.id}
          isOwner
          // Nothing to say into an empty room: once sharing is off, the thread
          // is history rather than a conversation.
          canComment={sharedWithCircle}
        />
      ) : null}
    </div>
  );
}
