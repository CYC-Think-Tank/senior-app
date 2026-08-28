import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { transcriptTurns } from "@/lib/db/schema";
import type { AudioCut } from "@/lib/audio/cuts";

/**
 * Reads only cut timestamps. Callers must authorize the session ids first;
 * transcript rows deliberately remain hidden from family and public clients.
 */
export async function getExcludedAudioCuts(
  sessionIds: string[],
): Promise<Map<string, AudioCut[]>> {
  const bySession = new Map<string, AudioCut[]>();
  if (sessionIds.length === 0) return bySession;

  let rows;
  try {
    rows = await db
      .select({
        sessionId: transcriptTurns.sessionId,
        startMs: transcriptTurns.startMs,
        endMs: transcriptTurns.endMs,
      })
      .from(transcriptTurns)
      .where(
        and(
          inArray(transcriptTurns.sessionId, sessionIds),
          eq(transcriptTurns.excluded, true),
        ),
      )
      .orderBy(asc(transcriptTurns.startMs));
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
