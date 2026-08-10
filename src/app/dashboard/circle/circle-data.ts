import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAudioUrl } from "@/lib/audio/encryption";
import { ensureMoral } from "@/lib/moral/generate";
import { RAW_BUCKET } from "@/lib/constants";
import { personName } from "@/lib/names";
import { getPreferredLocale } from "@/lib/preferred-locale";
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
 * Runs entirely through the RLS client: "circle reads comments" is what limits
 * this to conversations the caller owns or has circle access to, so there is
 * no separate permission check here.
 */
export const getConversationComments = cache(
  async (sessionId: string): Promise<CommentView[]> => {
    const { supabase } = await requireUser();

    const { data } = await supabase
      .from("conversation_comments")
      .select("id, author_id, author_name, body, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    return ((data ?? []) as Pick<
      ConversationComment,
      "id" | "author_id" | "author_name" | "body" | "created_at"
    >[]).map((row) => ({
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
 * Looks up the display names of a set of accounts through the caller's RLS
 * client. "read connected profiles" (migration 014) is what allows it, so this
 * silently returns nothing for anyone the caller is not connected to.
 */
async function connectedNames(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  ids: string[],
) {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", ids);

  for (const profile of (data ?? []) as Pick<
    Profile,
    "id" | "display_name" | "email"
  >[]) {
    names.set(profile.id, personName(profile.display_name, profile.email));
  }
  return names;
}

/**
 * Everything a friend has shared with their circle, newest first.
 *
 * The first read is the authorisation: "friends read circle shares" means a
 * row only comes back if the caller is a friend of its owner. Only after that
 * does the service role fetch the sessions themselves — see the note in
 * migration 015 for why friends never read `sessions` directly.
 */
export const getCircleFeed = cache(async (): Promise<CircleConversation[]> => {
  const { supabase, user } = await requireUser();

  const { data: shares } = await supabase
    .from("circle_shares")
    .select("session_id, owner_id, created_at")
    // Your own conversations live on your own pages, not in the feed.
    .neq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const rows = shares ?? [];
  if (rows.length === 0) return [];

  const names = await connectedNames(
    supabase,
    [...new Set(rows.map((row) => row.owner_id))],
  );

  const admin = createSupabaseAdminClient();
  const { data: sessions } = await admin
    .from("sessions")
    .select("id, title, topic, duration_ms, created_at")
    .in(
      "id",
      rows.map((row) => row.session_id),
    )
    .eq("status", "ready");

  const byId = new Map(
    ((sessions ?? []) as Pick<
      InterviewSession,
      "id" | "title" | "topic" | "duration_ms" | "created_at"
    >[]).map((session) => [session.id, session]),
  );

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
      durationMs: session.duration_ms,
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
  moral: string | null;
  isOwner: boolean;
};

/**
 * One shared conversation, or null when the caller may not hear it.
 *
 * Null covers "never shared with me", "unshared while I was looking at it",
 * and "unfriended while I was looking at it" alike — the circle_shares read is
 * re-authorised on every request, so revoking either half takes effect at the
 * next navigation. The caller turns all three into the same notFound(), which
 * is what keeps them indistinguishable from outside.
 */
export const getCircleConversation = cache(
  async (sessionId: string): Promise<CircleConversationDetail | null> => {
    const { supabase, user } = await requireUser();

    const { data: share } = await supabase
      .from("circle_shares")
      .select("session_id, owner_id")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (!share) return null;

    const names = await connectedNames(supabase, [share.owner_id]);
    const isOwner = share.owner_id === user.id;
    // "read connected profiles" does not cover your own row — that is what
    // "read own profile" is for — so fall back for the owner's own view.
    let ownerName = names.get(share.owner_id) ?? null;
    if (!ownerName && isOwner) {
      const { data: me } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle();
      ownerName = personName(me?.display_name, me?.email ?? user.email);
    }
    if (!ownerName) return null;

    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("status", "ready")
      .single();
    if (!data) return null;

    const session = data as InterviewSession;
    const audioUrl = session.raw_audio_path
      ? // Audio at rest is ciphertext, so playback always goes through the
        // signed /api/audio proxy rather than a Supabase signed URL.
        createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 6)
      : null;

    // Generated on the first view that needs it, then cached on the row —
    // exactly as the public share page does it.
    const locale = await getPreferredLocale();
    const moralByLocale = await ensureMoral(admin, session, ownerName);

    return {
      session,
      ownerId: share.owner_id,
      ownerName,
      audioUrl,
      moral: moralByLocale?.[locale] ?? null,
      isOwner,
    };
  },
);
