import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transcript_turns")
    .select("session_id, start_ms, end_ms")
    .in("session_id", sessionIds)
    .eq("excluded", true)
    .order("start_ms", { ascending: true });

  if (error) {
    console.error("Could not read transcript audio cuts:", error);
    return bySession;
  }

  const rows = (data ?? []).map(
    (row): CutRow => ({
      sessionId: row.session_id,
      startMs: row.start_ms,
      endMs: row.end_ms,
    }),
  );
  for (const row of rows) {
    const cuts = bySession.get(row.sessionId) ?? [];
    cuts.push({ startMs: row.startMs, endMs: row.endMs });
    bySession.set(row.sessionId, cuts);
  }

  return bySession;
}
