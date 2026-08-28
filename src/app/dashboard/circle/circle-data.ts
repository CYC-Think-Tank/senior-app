import { cache } from "react";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import {
  canReadCircleConversation,
  filterConnected,
  readableCircleShare,
} from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  conversationComments,
  profiles,
  sessions,
} from "@/lib/db/schema";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs, type AudioCut } from "@/lib/audio/cuts";
import { ensureMoral } from "@/lib/moral/generate";
import { RAW_BUCKET } from "@/lib/constants";
import { personName } from "@/lib/names";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { InterviewSession } from "@/lib/types";

export type CommentView = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

/**
 * The comments on one conversation, oldest first.
 *
 * `canReadCircleConversation` is the "circle reads comments" policy: the
 * storyteller always sees the comments on their own conversation, even after
 * switching circle sharing back off, and their friends see them only while the
 * switch is on and the friendship stands.
 */
export const getConversationComments = cache(
  async (sessionId: string): Promise<CommentView[]> => {
    const { user } = await requireUser();

    if (!(await canReadCircleConversation(user.id, sessionId))) return [];

    const rows = await db
      .select({
        id: conversationComments.id,
        authorId: conversationComments.authorId,
        authorName: conversationComments.authorName,
        body: conversationComments.body,
        createdAt: conversationComments.createdAt,
      })
      .from(conversationComments)
      .where(eq(conversationComments.sessionId, sessionId))
      .orderBy(asc(conversationComments.createdAt));

    return rows;
  },
);

export type CircleConversation = {
  sessionId: string;
  ownerId: string;
  ownerName: string;
  name: string;
  createdAt: string;
  durationMs: number | null;
  sharedAt: string;
};

/**
 * Display names for a set of accounts, limited to the ones the caller is
 * connected to. Anyone else is simply missing from the map, and callers treat
 * a missing name as "do not render this row".
 */
async function connectedNames(userId: string, ids: string[]) {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const connected = await filterConnected(userId, ids);
  if (connected.size === 0) return names;

  const rows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, [...connected]));

  for (const profile of rows) {
    names.set(profile.id, personName(profile.displayName, profile.email));
  }
  return names;
}

/**
 * Everything a friend has shared with their circle, newest first.
 *
 * The friendship filter is the authorisation: a share is only listed when its
 * owner is someone the caller is actually connected to. The sessions
 * themselves are read afterwards, by id, and never joined into this query —
 * see the note in migration 015, which is about `sessions.token` being a live
 * credential that must not travel with a feed row.
 */
export const getCircleFeed = cache(async (): Promise<CircleConversation[]> => {
  const { user } = await requireUser();

  const shares = await db
    .select()
    .from(circleShares)
    // Your own conversations live on your own pages, not in the feed.
    .where(ne(circleShares.ownerId, user.id))
    .orderBy(desc(circleShares.createdAt));

  if (shares.length === 0) return [];

  const names = await connectedNames(
    user.id,
    [...new Set(shares.map((row) => row.ownerId))],
  );
  // Shares from people the caller is not connected to never get this far.
  const visible = shares.filter((row) => names.has(row.ownerId));
  if (visible.length === 0) return [];

  const rows = await db
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

  const byId = new Map(rows.map((session) => [session.id, session]));
  const cutsBySession = await getExcludedAudioCuts([...byId.keys()]);

  const feed: CircleConversation[] = [];
  for (const row of visible) {
    const session = byId.get(row.sessionId);
    const ownerName = names.get(row.ownerId);
    // A share whose session is gone, or whose owner we can no longer name,
    // is not something to render half of.
    if (!session || !ownerName) continue;

    feed.push({
      sessionId: session.id,
      ownerId: row.ownerId,
      ownerName,
      name: session.title?.trim() || session.topic?.trim() || "",
      createdAt: session.createdAt,
      durationMs: editedAudioDurationMs(
        session.durationMs,
        cutsBySession.get(session.id) ?? [],
      ),
      sharedAt: row.createdAt,
    });
  }

  return feed;
});

export type CircleConversationDetail = {
  session: InterviewSession;
  ownerId: string;
  ownerName: string;
  audioUrl: string | null;
  audioCuts: AudioCut[];
  moral: string | null;
  isOwner: boolean;
};

/**
 * One shared conversation, or null when the caller may not hear it.
 *
 * Null covers "never shared with me", "unshared while I was looking at it",
 * and "unfriended while I was looking at it" alike — the share is
 * re-authorised on every request, so revoking either half takes effect at the
 * next navigation. The caller turns all three into the same notFound(), which
 * is what keeps them indistinguishable from outside.
 */
export const getCircleConversation = cache(
  async (sessionId: string): Promise<CircleConversationDetail | null> => {
    const { user } = await requireUser();

    const share = await readableCircleShare(user.id, sessionId);
    if (!share) return null;

    const isOwner = share.ownerId === user.id;
    // A caller is not "connected" to themselves, so the owner's own name is
    // read directly rather than through the friendship filter.
    let ownerName: string | null;
    if (isOwner) {
      const [me] = await db
        .select({ displayName: profiles.displayName, email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      ownerName = personName(me?.displayName, me?.email ?? user.email);
    } else {
      const names = await connectedNames(user.id, [share.ownerId]);
      ownerName = names.get(share.ownerId) ?? null;
    }
    if (!ownerName) return null;

    const [row] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, "ready")))
      .limit(1);
    if (!row) return null;

    const session = row as InterviewSession;
    const audioUrl = session.rawAudioPath
      ? // Audio at rest is ciphertext, so playback always goes through the
        // signed /api/audio proxy rather than a storage URL.
        createAudioUrl(RAW_BUCKET, session.rawAudioPath, 60 * 60 * 6)
      : null;
    const audioCuts =
      (await getExcludedAudioCuts([session.id])).get(session.id) ?? [];

    // Generated on the first view that needs it, then cached on the row —
    // exactly as the public share page does it.
    const locale = await getPreferredLocale();
    const moralByLocale = await ensureMoral(session, ownerName);

    return {
      session,
      ownerId: share.ownerId,
      ownerName,
      audioUrl,
      audioCuts,
      moral: moralByLocale?.[locale] ?? null,
      isOwner,
    };
  },
);
