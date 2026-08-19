import { after, NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import {
  progressConversationVideo,
  publicConversationVideo,
  startConversationVideo,
} from "@/lib/memoir/workflow";
import { isSeegenConfigured } from "@/lib/memoir/seedance";
import type { ConversationVideo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/** The statuses that still have work left to do before the film is watchable. */
const ACTIVE = ["planning", "preparing", "generating", "rendering"];

/**
 * The animated memoir for one conversation — the native twin of
 * `/api/family/conversation-videos`, which is cookie-bound and so unreachable
 * from the app.
 *
 * Generation is a long job nudged forward a step per request, exactly as on the
 * web: answer with what is known now, then continue the work in `after()` so
 * the client is never left holding a request open across a provider call.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMobileUser(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const { id } = await params;

    // The RLS policy on this table is the whole access check: a row only comes
    // back to the storyteller who recorded the conversation (migration 017).
    const { data } = await supabase
      .from("conversation_videos")
      .select("*")
      .eq("session_id", id)
      .maybeSingle();

    // Nothing made yet is not an error — it is the state the app offers the
    // "create a film" button in.
    if (!data) return NextResponse.json({ video: null });

    const video = data as ConversationVideo;
    if (ACTIVE.includes(video.status)) {
      after(async () => {
        try {
          await progressConversationVideo(video.id);
        } catch (error) {
          console.error("Could not continue memoir video after refreshing:", error);
        }
      });
    }
    return NextResponse.json({ video: await publicConversationVideo(video) });
  } catch (error) {
    console.error("Could not refresh memoir video:", error);
    return serverError("Could not refresh the video.");
  }
}

/** Starts the film, or replaces a finished one when `regenerate` is set. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireMobileUser(request);
    if (!auth) return unauthorized();
    const { supabase, user } = auth;
    const { id } = await params;

    if (!isSeegenConfigured()) {
      return NextResponse.json(
        { error: "Video generation is not set up yet." },
        { status: 503 },
      );
    }

    const body = await readJson(request);
    const regenerate = body.regenerate === true;

    // Authorise through the caller's client before the service role writes —
    // and only a finished conversation has a story to adapt.
    const { data: session } = await supabase
      .from("sessions")
      .select("id, guests!inner(user_id)")
      .eq("id", id)
      .eq("status", "ready")
      .eq("guests.user_id", user.id)
      .maybeSingle();
    if (!session) return notFound("This conversation could not be opened.");

    const video = await startConversationVideo(id, { regenerate });
    if (ACTIVE.includes(video.status)) {
      after(async () => {
        try {
          await progressConversationVideo(video.id);
        } catch (error) {
          console.error("Could not continue memoir video after responding:", error);
        }
      });
    }
    return NextResponse.json({ video: await publicConversationVideo(video) });
  } catch (error) {
    console.error("Could not start memoir video:", error);
    return serverError(
      error instanceof Error ? error.message : "Could not start the video.",
    );
  }
}
