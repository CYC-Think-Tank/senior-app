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
import { asc, eq } from "drizzle-orm";
import { ownSessionCondition } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  conversationVideos,
  guests,
  sessions as sessionsTable,
  transcriptTurns,
} from "@/lib/db/schema";
import { decryptTurns } from "@/lib/transcript/encryption";
import { CommentThread } from "../circle/comment-thread";
import { getConversationComments } from "../circle/circle-data";
import type { TranscriptTurn } from "@/lib/types";
import type { ConversationVideo } from "@/lib/types";
import { getVideoGenerationQuota, publicConversationVideo } from "@/lib/memoir/workflow";
import { MemoirVideoCard } from "./memoir-video-card";
import { ConversationTranscriptEditor } from "./transcript-editor";

export const dynamic = "force-dynamic";

export default async function FamilyConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { user } = await requireUser();
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  // Every conversation this account may see, which is both the authorisation
  // for this one and the sibling list an unnamed conversation is numbered
  // against — it has to get the same number here as it does in the list.
  const all = await db
    .select({
      id: sessionsTable.id,
      title: sessionsTable.title,
      status: sessionsTable.status,
      createdAt: sessionsTable.createdAt,
      durationMs: sessionsTable.durationMs,
      rawAudioPath: sessionsTable.rawAudioPath,
      guestName: guests.name,
    })
    .from(sessionsTable)
    .innerJoin(guests, eq(guests.id, sessionsTable.guestId))
    .where(ownSessionCondition(user.id));

  const s = all.find((row) => row.id === sessionId);
  if (!s) notFound();

  const name =
    conversationNames(all, (number) =>
      t("familyConversationNumbered", { number })
    ).get(s.id) ?? "";

  const audioUrl = s.rawAudioPath
    ? createAudioUrl(RAW_BUCKET, s.rawAudioPath, 60 * 60 * 6)
    : null;

  const finished = s.status === "ready";
  // The read above already proved this is the caller's own conversation, so
  // the transcript — which no family-facing query may reach on its own — can
  // be fetched and decrypted here.
  const turnRows = finished
    ? await db
        .select()
        .from(transcriptTurns)
        .where(eq(transcriptTurns.sessionId, s.id))
        .orderBy(asc(transcriptTurns.idx))
    : [];
  const turns = finished
    ? decryptTurns(s.id, turnRows as TranscriptTurn[])
    : [];
  const cuts = turns
    .filter((turn) => turn.excluded)
    .map((turn) => ({ startMs: turn.startMs, endMs: turn.endMs }));
  const editedDuration = editedAudioDurationMs(s.durationMs, cuts);

  const [videoRow] = finished
    ? await db
        .select()
        .from(conversationVideos)
        .where(eq(conversationVideos.sessionId, s.id))
        .limit(1)
    : [];
  const initialVideo = videoRow
    ? await publicConversationVideo(videoRow as ConversationVideo)
    : null;
  // How many complete films this account has left, so the card can say so
  // before the storyteller commits to one.
  const videoQuota = finished
    ? await getVideoGenerationQuota(user.id)
    : null;

  // Only finished conversations can be shared, and the comment thread is only
  // worth showing once there is a circle that could have written in it.
  const [share] = finished
    ? await db
        .select({ sessionId: circleShares.sessionId })
        .from(circleShares)
        .where(eq(circleShares.sessionId, sessionId))
        .limit(1)
    : [];
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
        <Monogram name={s.guestName} size="lg" />
        <div>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
            {name}
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            {new Date(s.createdAt).toLocaleDateString(locale, {
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
          guestName={s.guestName}
          initialTurns={turns}
          audioUrl={audioUrl}
          durationMs={s.durationMs}
        />
      ) : audioUrl ? (
        <AudioPlayer src={audioUrl} durationMs={s.durationMs} />
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
        <MemoirVideoCard
          sessionId={s.id}
          initialVideo={initialVideo}
          initialQuota={videoQuota}
        />
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
