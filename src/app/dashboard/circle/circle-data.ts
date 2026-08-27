import { cache } from "react";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import {
  canReadComments,
  canReadSharedSession,
  circleSharesFilter,
  conversationOwner,
  friendIds,
} from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  conversationComments,
  profiles,
  sessions as sessionsTable,
} from "@/lib/db/schema";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs, type AudioCut } from "@/lib/audio/cuts";
import { ensureMoral } from "@/lib/moral/generate";
import { RAW_BUCKET } from "@/lib/constants";
import { personName } from "@/lib/names";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type {
  ConversationComment,
  InterviewSession,
  Profile,
} from "@/lib/types";

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
 * `canReadComments` is the old "circle reads comments" policy, which limited
 * this to conversations the caller owns or has circle access to. It has to be
 * asked explicitly now — without it this would return any conversation's
 * thread to anyone who knew a session id.
 */
export const getConversationComments = cache(
  async (sessionId: string): Promise<CommentView[]> => {
    const { user } = await requireUser();

    if (!(await canReadComments(user.id, sessionId))) return [];

    const found = (await db
      .select({
        id: conversationComments.id,
        author_id: conversationComments.author_id,
        author_name: conversationComments.author_name,
        body: conversationComments.body,
        created_at: conversationComments.created_at,
      })
      .from(conversationComments)
      .where(eq(conversationComments.session_id, sessionId))
      .orderBy(asc(conversationComments.created_at))) as Pick<
      ConversationComment,
      "id" | "author_id" | "author_name" | "body" | "created_at"
    >[];

    return found.map((row) => ({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at,
    }));
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
 * Display names for a set of accounts.
 *
 * Every caller here passes ids that came out of a circle share the caller is a
 * friend of, which is the ground "read connected profiles" (migration 014)
 * stood on. Do not hand it arbitrary ids — it applies no filter of its own.
 */
async function connectedNames(ids: string[]) {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const found = (await db
    .select({
      id: profiles.id,
      display_name: profiles.display_name,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, ids))) as Pick<
    Profile,
    "id" | "display_name" | "email"
  >[];

  for (const profile of found) {
    names.set(profile.id, personName(profile.display_name, profile.email));
  }
  return names;
}

/**
 * Everything a friend has shared with their circle, newest first.
 *
 * The first read is the authorisation: `circleSharesFilter` narrows to shares
 * owned by the caller's friends, which is what "friends read circle shares"
 * used to do. Only after that are the sessions themselves fetched — see the
 * note in migration 015 for why friends must never query `sessions` directly.
 */
export const getCircleFeed = cache(async (): Promise<CircleConversation[]> => {
  const { user } = await requireUser();

  const friends = await friendIds(user.id);
  if (friends.length === 0) return [];

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
        // Your own conversations live on your own pages, not in the feed.
        ne(circleShares.owner_id, user.id)
      )
    )
    .orderBy(desc(circleShares.created_at));

  if (rows.length === 0) return [];

  const names = await connectedNames([
    ...new Set(rows.map((row) => row.owner_id)),
  ]);

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
  const cutsBySession = await getExcludedAudioCuts([...byId.keys()]);

  const feed: CircleConversation[] = [];
  for (const row of rows) {
    const session = byId.get(row.session_id);
    const ownerName = names.get(row.owner_id);
    // A share whose session is gone, or whose owner we can no longer name,
    // is not something to render half of.
    if (!session || !ownerName) continue;

    feed.push({
      sessionId: session.id,
      ownerId: row.owner_id,
      ownerName,
      name: session.title?.trim() || session.topic?.trim() || "",
      createdAt: session.created_at,
      durationMs: editedAudioDurationMs(
        session.duration_ms,
        cutsBySession.get(session.id) ?? [],
      ),
      sharedAt: row.created_at,
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
 * and "unfriended while I was looking at it" alike — `canReadSharedSession` is
 * evaluated on every request, so revoking either half takes effect at the next
 * navigation. The caller turns all three into the same notFound(), which is
 * what keeps them indistinguishable from outside.
 */
export const getCircleConversation = cache(
  async (sessionId: string): Promise<CircleConversationDetail | null> => {
    const { user } = await requireUser();

    if (!(await canReadSharedSession(user.id, sessionId))) return null;

    const ownerId = await conversationOwner(sessionId);
    if (!ownerId) return null;
    const isOwner = ownerId === user.id;

    const names = await connectedNames([ownerId]);
    let ownerName = names.get(ownerId) ?? null;
    if (!ownerName && isOwner) {
      const [me] = await db
        .select({ display_name: profiles.display_name, email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      ownerName = personName(me?.display_name, me?.email ?? user.email);
    }
    if (!ownerName) return null;

    const [session] = (await db
      .select()
      .from(sessionsTable)
      .where(
        and(eq(sessionsTable.id, sessionId), eq(sessionsTable.status, "ready"))
      )
      .limit(1)) as InterviewSession[];
    if (!session) return null;

    const audioUrl = session.raw_audio_path
      ? // Audio at rest is ciphertext, so playback always goes through the
        // signed /api/audio proxy rather than a storage URL the browser could
        // fetch itself.
        createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 6)
      : null;
    const audioCuts =
      (await getExcludedAudioCuts([session.id])).get(session.id) ?? [];

    // Generated on the first view that needs it, then cached on the row —
    // exactly as the public share page does it.
    const locale = await getPreferredLocale();
    const moralByLocale = await ensureMoral(session, ownerName);

    return {
      session,
      ownerId,
      ownerName,
      audioUrl,
      audioCuts,
      moral: moralByLocale?.[locale] ?? null,
      isOwner,
    };
  },
);
