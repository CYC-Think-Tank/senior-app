import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET, STORY_VIDEOS_BUCKET } from "@/lib/constants";
import { normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames, personName } from "@/lib/names";
import { ensureMoral } from "@/lib/moral/generate";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One conversation with its transcript, ready to play and edit.
 *
 * The RLS read is the authorisation for all three verbs in this file: a row
 * only comes back when the caller recorded it themselves.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const { data: visible } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", id)
    .in("status", ["ready", "recording"])
    .eq("guests.user_id", user.id)
    .maybeSingle();
  if (!visible) return notFound("This conversation could not be opened.");

  const { data } = await admin.from("sessions").select("*").eq("id", id).single();
  if (!data) return notFound("This conversation could not be opened.");
  const session = data as InterviewSession;

  const [{ data: profile }, { data: turnRows }, { data: share }, { data: allSessions }] =
    await Promise.all([
      supabase.from("profiles").select("display_name, email, locale").eq("id", user.id).maybeSingle(),
      admin
        .from("transcript_turns")
        .select("id, idx, speaker, text, start_ms, end_ms, excluded")
        .eq("session_id", id)
        .order("idx", { ascending: true }),
      supabase
        .from("circle_shares")
        .select("session_id")
        .eq("session_id", id)
        .maybeSingle(),
      // Names are positional — "Conversation 3" only means anything against
      // the whole list — so the list is what numbering is computed from.
      supabase
        .from("sessions")
        .select("id, title, created_at, guests!inner(user_id)")
        .in("status", ["ready", "recording"])
        .eq("guests.user_id", user.id),
    ]);

  const locale = normalizeLocale(profile?.locale);
  const names = conversationNames(
    (allSessions ?? []) as unknown as {
      id: string;
      title: string | null;
      created_at: string;
    }[],
    (number) => translate(locale, "familyConversationNumbered", { number })
  );

  const turns = decryptTurns(id, turnRows ?? []).map((turn) => ({
    id: turn.id,
    idx: turn.idx,
    speaker: turn.speaker,
    text: turn.text,
    startMs: turn.start_ms,
    endMs: turn.end_ms,
    excluded: turn.excluded,
  }));

  const cuts = turns
    .filter((turn) => turn.excluded)
    .map((turn) => ({ startMs: turn.startMs, endMs: turn.endMs }));

  // Audio at rest is ciphertext, so playback goes through the signed
  // /api/audio proxy rather than a Supabase signed URL.
  const audioPath = session.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 6)
    : null;

  // Written once, on the first view that needs it, then cached on the row —
  // exactly as the share page and the circle page do it.
  const ownerName = personName(profile?.display_name, profile?.email ?? user.email);
  const moral =
    session.status === "ready" ? await ensureMoral(admin, session, ownerName) : null;

  return NextResponse.json({
    id: session.id,
    name: names.get(session.id) ?? translate(locale, "familyConversationLabel"),
    title: session.title,
    createdAt: session.created_at,
    durationMs: editedAudioDurationMs(session.duration_ms, cuts),
    status: session.status,
    shareToken: session.share_token,
    sharedWithCircle: Boolean(share),
    resumeToken: session.status === "ready" ? null : session.token,
    audioPath,
    moral: moral?.[locale] ?? null,
    turns,
  });
}

/**
 * Renames a conversation. Writes `title`, never `topic` — the latter feeds the
 * AI host, so it has to keep describing the interview. An empty name clears it
 * and the conversation returns to numbering.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const title = readString(body, "title", 120) || null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", id)
    .in("status", ["ready", "recording"])
    .eq("guests.user_id", user.id)
    .maybeSingle();
  if (!session) return notFound("This conversation could not be renamed.");

  const { error } = await admin.from("sessions").update({ title }).eq("id", id);
  if (error) {
    console.error("Could not rename the conversation:", error);
    return serverError("Could not rename the conversation.");
  }

  return NextResponse.json({ ok: true });
}

/** Permanently removes a conversation, its recording, and any story video. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const { data: visible } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", id)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .maybeSingle();
  if (!visible) return notFound("This conversation could not be deleted.");

  const [{ data: session }, { data: video }] = await Promise.all([
    admin.from("sessions").select("raw_audio_path").eq("id", id).single(),
    admin.from("conversation_videos").select("id").eq("session_id", id).maybeSingle(),
  ]);

  if (session?.raw_audio_path) {
    await admin.storage.from(RAW_BUCKET).remove([session.raw_audio_path]);
  }
  if (video?.id) {
    const prefix = `${id}/${video.id}`;
    const [{ data: objects }, { data: scenes }] = await Promise.all([
      admin.storage.from(STORY_VIDEOS_BUCKET).list(prefix),
      admin.storage.from(STORY_VIDEOS_BUCKET).list(`${prefix}/scenes`),
    ]);
    const paths = [
      ...(objects ?? []).filter((o) => o.id).map((o) => `${prefix}/${o.name}`),
      ...(scenes ?? []).filter((o) => o.id).map((o) => `${prefix}/scenes/${o.name}`),
    ];
    if (paths.length) {
      await admin.storage.from(STORY_VIDEOS_BUCKET).remove(paths);
    }
  }

  const { error } = await admin.from("sessions").delete().eq("id", id);
  if (error) {
    console.error("Could not delete the conversation:", error);
    return serverError("Could not delete the conversation.");
  }

  return NextResponse.json({ ok: true });
}
