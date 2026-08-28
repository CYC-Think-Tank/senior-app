import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { guests, sessions, transcriptTurns } from "@/lib/db/schema";
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
  // Admins read every conversation, which is the point of this page.
  await requireAdmin();

  const [rows, turns] = await Promise.all([
    db
      .select({ session: sessions, guest: guests })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guestId))
      .where(eq(sessions.id, id))
      .limit(1),
    db
      .select()
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, id))
      .orderBy(asc(transcriptTurns.idx)),
  ]);

  const row = rows[0];
  if (!row) notFound();

  const audioUrl = row.session.rawAudioPath
    ? createAudioUrl(RAW_BUCKET, row.session.rawAudioPath, 60 * 60 * 2)
    : null;

  return (
    <TranscriptEditor
      session={row.session as InterviewSession}
      guest={row.guest as Guest}
      initialTurns={decryptTurns(id, turns as TranscriptTurn[])}
      audioUrl={audioUrl}
    />
  );
}
