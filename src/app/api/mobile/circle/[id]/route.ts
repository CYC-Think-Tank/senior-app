import { NextResponse, type NextRequest } from "next/server";
import { notFound, requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET } from "@/lib/constants";
import { normalizeLocale } from "@/lib/i18n";
import { personName } from "@/lib/names";
import { ensureMoral } from "@/lib/moral/generate";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { ConversationComment, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * One conversation shared with the caller's circle, with its notes. Port of
 * `getCircleConversation()` and `getConversationComments()`.
 *
 * A 404 covers "never shared with me", "unshared while I was looking at it"
 * and "unfriended while I was looking at it" alike — the circle_shares read is
 * re-authorised on every request, which is what keeps those three
 * indistinguishable from outside.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const { data: share } = await supabase
    .from("circle_shares")
    .select("session_id, owner_id")
    .eq("session_id", id)
    .maybeSingle();
  if (!share) return notFound("This conversation could not be opened.");

  const isOwner = share.owner_id === user.id;
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", share.owner_id)
    .maybeSingle();
  // "read connected profiles" does not cover your own row — that is what "read
  // own profile" is for — so fall back for the owner's own view.
  const ownerName = ownerProfile
    ? personName(ownerProfile.display_name, ownerProfile.email)
    : isOwner
      ? personName(null, user.email)
      : null;
  if (!ownerName) return notFound("This conversation could not be opened.");

  const { data } = await admin
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("status", "ready")
    .single();
  if (!data) return notFound("This conversation could not be opened.");
  const session = data as InterviewSession;

  const [{ data: profile }, { data: commentRows }] = await Promise.all([
    supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle(),
    // "circle reads comments" is what limits this to conversations the caller
    // owns or has circle access to, so there is no separate check here.
    supabase
      .from("conversation_comments")
      .select("id, author_id, author_name, body, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const locale = normalizeLocale(profile?.locale);
  const cuts = (await getExcludedAudioCuts([session.id])).get(session.id) ?? [];
  const audioPath = session.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 6)
    : null;

  // Generated on the first view that needs it, then cached on the row.
  const moral = await ensureMoral(admin, session, ownerName);

  const comments = ((commentRows ?? []) as Pick<
    ConversationComment,
    "id" | "author_id" | "author_name" | "body" | "created_at"
  >[]).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    // Its author may always take back what they said, and the storyteller may
    // remove anything left on their own conversation.
    canDelete: row.author_id === user.id || isOwner,
  }));

  return NextResponse.json({
    sessionId: session.id,
    ownerId: share.owner_id,
    ownerName,
    name: session.title?.trim() || session.topic?.trim() || "",
    createdAt: session.created_at,
    durationMs: editedAudioDurationMs(session.duration_ms, cuts),
    audioPath,
    moral: moral?.[locale] ?? null,
    isOwner,
    comments,
  });
}
