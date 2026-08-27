import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { circleSharesFilter, friendIds } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  profiles as profilesTable,
  sessions as sessionsTable,
} from "@/lib/db/schema";
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
 * The first read is the authorisation: `circleSharesFilter` narrows to shares
 * owned by the caller's friends, which is what "friends read circle shares"
 * used to do. Only then are the sessions themselves fetched — see migration
 * 015 for why friends must never query `sessions` directly (it would hand them
 * `token` and `share_token` along with everything else).
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const friends = await friendIds(user.id);
  if (friends.length === 0) return NextResponse.json([]);

  const rows = await db
    .select({
      session_id: circleShares.session_id,
      owner_id: circleShares.owner_id,
      created_at: circleShares.created_at,
    })
    .from(circleShares)
    .where(
      and(
        circleSharesFilter(user.id, friends),
        // Your own conversations live on your own screens, not in the feed.
        ne(circleShares.owner_id, user.id)
      )
    )
    .orderBy(desc(circleShares.created_at));

  if (rows.length === 0) return NextResponse.json([]);

  // Every id here came out of a share the caller is a friend of, which is the
  // same ground "read connected profiles" (migration 014) stood on.
  const ownerProfiles = (await db
    .select({
      id: profilesTable.id,
      display_name: profilesTable.display_name,
      email: profilesTable.email,
    })
    .from(profilesTable)
    .where(
      inArray(profilesTable.id, [...new Set(rows.map((row) => row.owner_id))])
    )) as Pick<Profile, "id" | "display_name" | "email">[];

  const names = new Map<string, string>();
  for (const profile of ownerProfiles) {
    names.set(profile.id, personName(profile.display_name, profile.email));
  }

  const shared = (await db
    .select({
      id: sessionsTable.id,
      title: sessionsTable.title,
      topic: sessionsTable.topic,
      duration_ms: sessionsTable.duration_ms,
      created_at: sessionsTable.created_at,
    })
    .from(sessionsTable)
    .where(
      and(
        inArray(
          sessionsTable.id,
          rows.map((row) => row.session_id)
        ),
        eq(sessionsTable.status, "ready")
      )
    )) as Pick<
    InterviewSession,
    "id" | "title" | "topic" | "duration_ms" | "created_at"
  >[];

  const byId = new Map(shared.map((session) => [session.id, session]));
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
