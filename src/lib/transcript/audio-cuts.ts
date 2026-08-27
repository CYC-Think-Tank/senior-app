import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { transcriptTurns } from "@/lib/db/schema";
import type { AudioCut } from "@/lib/audio/cuts";

type CutRow = AudioCut & { sessionId: string };

/**
 * Reads only cut timestamps. Callers must authorize the session ids first;
 * transcript rows deliberately remain hidden from family and public clients.
 */
export async function getExcludedAudioCuts(
  sessionIds: string[],
): Promise<Map<string, AudioCut[]>> {
  const bySession = new Map<string, AudioCut[]>();
  if (sessionIds.length === 0) return bySession;

  let rows: CutRow[];
  try {
    const found = await db
      .select({
        session_id: transcriptTurns.session_id,
        start_ms: transcriptTurns.start_ms,
        end_ms: transcriptTurns.end_ms,
      })
      .from(transcriptTurns)
      .where(
        and(
          inArray(transcriptTurns.session_id, sessionIds),
          eq(transcriptTurns.excluded, true)
        )
      )
      .orderBy(asc(transcriptTurns.start_ms));

    rows = found.map(
      (row): CutRow => ({
        sessionId: row.session_id,
        startMs: row.start_ms,
        endMs: row.end_ms,
      }),
    );
  } catch (error) {
    console.error("Could not read transcript audio cuts:", error);
    return bySession;
  }
  for (const row of rows) {
    const cuts = bySession.get(row.sessionId) ?? [];
    cuts.push({ startMs: row.startMs, endMs: row.endMs });
    bySession.set(row.sessionId, cuts);
  }

  return bySession;
}
