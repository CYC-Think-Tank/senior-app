import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { filterConnected } from "@/lib/authz";
import { db } from "@/lib/db";
import { circleShares, profiles, sessions } from "@/lib/db/schema";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { personName } from "@/lib/names";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";

export const dynamic = "force-dynamic";

/**
 * Everything a friend has shared with their circle, newest first. Port of
 * `getCircleFeed()`.
 *
 * The friendship filter is the authorisation: a share is only listed when its
 * owner is someone the caller is actually connected to. The sessions
 * themselves are read afterwards, by id, and never joined into this query —
 * see the note in migration 015, which is about `sessions.token` being a live
 * credential that must not travel with a feed row.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const shares = await db
    .select()
    .from(circleShares)
    // Your own conversations live on your own screens, not in the feed.
    .where(ne(circleShares.ownerId, user.id))
    .orderBy(desc(circleShares.createdAt));

  if (shares.length === 0) return NextResponse.json([]);

  const ownerIds = [...new Set(shares.map((row) => row.ownerId))];
  const connected = await filterConnected(user.id, ownerIds);
  const visible = shares.filter((row) => connected.has(row.ownerId));
  if (visible.length === 0) return NextResponse.json([]);

  const profileRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, [...connected]));

  const names = new Map<string, string>();
  for (const profile of profileRows) {
    names.set(profile.id, personName(profile.displayName, profile.email));
  }

  const sessionRows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      topic: sessions.topic,
      durationMs: sessions.durationMs,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(
      and(
        inArray(sessions.id, visible.map((row) => row.sessionId)),
        eq(sessions.status, "ready"),
      ),
    );

  const byId = new Map(sessionRows.map((session) => [session.id, session]));
  const cuts = await getExcludedAudioCuts([...byId.keys()]);

  const feed = [];
  for (const row of visible) {
    const session = byId.get(row.sessionId);
    const ownerName = names.get(row.ownerId);
    // A share whose session is gone, or whose owner we can no longer name, is
    // not something to render half of.
    if (!session || !ownerName) continue;

    feed.push({
      sessionId: session.id,
      ownerId: row.ownerId,
      ownerName,
      name: session.title?.trim() || session.topic?.trim() || "",
      createdAt: session.createdAt,
      durationMs: editedAudioDurationMs(
        session.durationMs,
        cuts.get(session.id) ?? []
      ),
      sharedAt: row.createdAt,
    });
  }

  return NextResponse.json(feed);
}
