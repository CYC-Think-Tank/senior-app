import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  guests as guestsTable,
  sessions as sessionsTable,
  transcriptTurns,
} from "@/lib/db/schema";
import { createAudioUrl } from "@/lib/audio/encryption";
import { RAW_BUCKET } from "@/lib/constants";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { Guest, InterviewSession, TranscriptTurn } from "@/lib/types";
import TranscriptEditor from "./transcript-editor";

export const dynamic = "force-dynamic";

export default async function SessionEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // "admin manages sessions" and "admin manages turns" are what let this read
  // any conversation; `requireAdmin` carries both.
  await requireAdmin();

  const [rows, turns] = await Promise.all([
    db
      .select({ session: sessionsTable, guest: guestsTable })
      .from(sessionsTable)
      .innerJoin(guestsTable, eq(guestsTable.id, sessionsTable.guest_id))
      .where(eq(sessionsTable.id, id))
      .limit(1),
    db
      .select()
      .from(transcriptTurns)
      .where(eq(transcriptTurns.session_id, id))
      .orderBy(asc(transcriptTurns.idx)),
  ]);

  const found = rows[0];
  if (!found) notFound();

  const audioUrl = found.session.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, found.session.raw_audio_path, 60 * 60 * 2)
    : null;

  return (
    <TranscriptEditor
      session={found.session as unknown as InterviewSession}
      guest={found.guest as unknown as Guest}
      initialTurns={decryptTurns(id, turns as TranscriptTurn[])}
      audioUrl={audioUrl}
    />
  );
}
