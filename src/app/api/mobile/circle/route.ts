import { NextResponse, type NextRequest } from "next/server";
import { requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { personName } from "@/lib/names";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { InterviewSession, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Everything a friend has shared with their circle, newest first. Port of
 * `getCircleFeed()`.
 *
 * The first read is the authorisation: "friends read circle shares" means a
 * row only comes back if the caller is a friend of its owner. Only then does
 * the service role fetch the sessions — see migration 015 for why friends
 * never read `sessions` directly.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;

  const { data: shares } = await supabase
    .from("circle_shares")
    .select("session_id, owner_id, created_at")
    // Your own conversations live on your own screens, not in the feed.
    .neq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const rows = shares ?? [];
  if (rows.length === 0) return NextResponse.json([]);

  // "read connected profiles" (migration 014) is what allows this, so it
  // silently returns nothing for anyone the caller is not connected to.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", [...new Set(rows.map((row) => row.owner_id))]);

  const names = new Map<string, string>();
  for (const profile of (profiles ?? []) as Pick<
    Profile,
    "id" | "display_name" | "email"
  >[]) {
    names.set(profile.id, personName(profile.display_name, profile.email));
  }

  const { data: sessions } = await admin
    .from("sessions")
    .select("id, title, topic, duration_ms, created_at")
    .in(
      "id",
      rows.map((row) => row.session_id)
    )
    .eq("status", "ready");

  const byId = new Map(
    ((sessions ?? []) as Pick<
      InterviewSession,
      "id" | "title" | "topic" | "duration_ms" | "created_at"
    >[]).map((session) => [session.id, session])
  );
  const cuts = await getExcludedAudioCuts([...byId.keys()]);

  const feed = [];
  for (const row of rows) {
    const session = byId.get(row.session_id);
    const ownerName = names.get(row.owner_id);
    // A share whose session is gone, or whose owner we can no longer name, is
    // not something to render half of.
    if (!session || !ownerName) continue;

    feed.push({
      sessionId: session.id,
      ownerId: row.owner_id,
      ownerName,
      name: session.title?.trim() || session.topic?.trim() || "",
      createdAt: session.created_at,
      durationMs: editedAudioDurationMs(
        session.duration_ms,
        cuts.get(session.id) ?? []
      ),
      sharedAt: row.created_at,
    });
  }

  return NextResponse.json(feed);
}
