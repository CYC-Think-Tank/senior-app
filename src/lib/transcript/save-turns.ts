import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { transcriptTurns } from "@/lib/db/schema";
import { encryptTurnText } from "@/lib/transcript/encryption";
import type { TurnDraft } from "@/lib/types";

export const MAX_TURNS = 1000;

/** Rejects payloads that are not a plausible list of interview turns. */
export function isTurnDraftArray(value: unknown): value is TurnDraft[] {
  return Array.isArray(value) && value.length <= MAX_TURNS;
}

type TurnRow = {
  session_id: string;
  idx: number;
  speaker: "ai" | "guest";
  text: string;
  start_ms: number;
  end_ms: number;
};

function toRows(sessionId: string, turns: TurnDraft[]): TurnRow[] {
  return turns
    .filter(
      (t) =>
        (t.speaker === "ai" || t.speaker === "guest") &&
        typeof t.text === "string" &&
        t.text.trim().length > 0
    )
    .sort((a, b) => a.startMs - b.startMs)
    .map((t, idx) => {
      const start = Math.max(0, Math.round(Number(t.startMs) || 0));
      return {
        session_id: sessionId,
        idx,
        speaker: t.speaker,
        // Capped before sealing: the limit is on what was said, not on the
        // framing, and the row is unreadable after this point.
        text: encryptTurnText(sessionId, idx, t.text.trim().slice(0, 10_000)),
        start_ms: start,
        end_ms: Math.max(start + 100, Math.round(Number(t.endMs) || 0)),
      };
    });
}

/**
 * Writes the transcript so far, replacing whatever the last checkpoint left.
 *
 * Upserting on (session_id, idx) and only then trimming the tail means the
 * table is never momentarily empty — a checkpoint that is interrupted halfway
 * leaves the previous transcript intact rather than wiping it. `excluded` is
 * deliberately not written so admin edits survive a re-finalize.
 *
 * An empty write is a no-op, never an instruction to erase: a conversation
 * being picked back up has said nothing *yet*, and its first checkpoint must
 * not take the earlier sitting down with it.
 */
export async function saveTurns(
  sessionId: string,
  turns: TurnDraft[]
): Promise<{ error: string | null; count: number }> {
  const rows = toRows(sessionId, turns);
  if (rows.length === 0) return { error: null, count: 0 };

  try {
    await db
      .insert(transcriptTurns)
      .values(rows)
      .onConflictDoUpdate({
        target: [transcriptTurns.session_id, transcriptTurns.idx],
        set: {
          speaker: sql`excluded.speaker`,
          text: sql`excluded.text`,
          start_ms: sql`excluded.start_ms`,
          end_ms: sql`excluded.end_ms`,
        },
      });
  } catch (error) {
    console.error("transcript upsert failed:", error);
    return { error: "Could not save the transcript.", count: 0 };
  }

  // Drop turns left behind by a longer previous attempt on this session.
  try {
    await db
      .delete(transcriptTurns)
      .where(
        and(
          eq(transcriptTurns.session_id, sessionId),
          gte(transcriptTurns.idx, rows.length)
        )
      );
  } catch (trimError) {
    console.error("transcript trim failed:", trimError);
  }

  return { error: null, count: rows.length };
}
