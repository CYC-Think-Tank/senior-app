import { after, NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import {
  getVideoGenerationQuota,
  progressConversationVideo,
  publicConversationVideo,
  startConversationVideo,
  VideoGenerationLimitError,
} from "@/lib/memoir/workflow";
import { isSeegenConfigured } from "@/lib/memoir/seedance";
import { eq } from "drizzle-orm";
import { ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationVideos } from "@/lib/db/schema";
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
    const { user } = auth;
    const { id } = await params;

    // The film belongs to whoever recorded the conversation (migration 017),
    // so ownership of the conversation is the whole access check.
    const owned = await ownsReadySession(user.id, id);

    // The app labels its create/remake button with what is left, so the
    // allowance travels with the film on every refresh.
    const quota = await getVideoGenerationQuota(user.id);

    const [data] = owned
      ? await db
          .select()
          .from(conversationVideos)
          .where(eq(conversationVideos.sessionId, id))
          .limit(1)
      : [];

    // Nothing made yet is not an error — it is the state the app offers the
    // "create a film" button in.
    if (!data) return NextResponse.json({ video: null, quota });

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
    return NextResponse.json({ video: await publicConversationVideo(video), quota });
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
    const { user } = auth;
    const { id } = await params;

    if (!isSeegenConfigured()) {
      return NextResponse.json(
        { error: "Video generation is not set up yet." },
        { status: 503 },
      );
    }

    const body = await readJson(request);
    const regenerate = body.regenerate === true;

    // Films cost money to make, so the conversation has to be theirs — and
    // only a finished one has a story to adapt.
    if (!(await ownsReadySession(user.id, id))) {
      return notFound("This conversation could not be opened.");
    }

    const video = await startConversationVideo(id, { userId: user.id, regenerate });
    if (ACTIVE.includes(video.status)) {
      after(async () => {
        try {
          await progressConversationVideo(video.id);
        } catch (error) {
          console.error("Could not continue memoir video after responding:", error);
        }
      });
    }
    return NextResponse.json({
      video: await publicConversationVideo(video),
      quota: await getVideoGenerationQuota(user.id),
    });
  } catch (error) {
    // Out of films is a plain answer, not a server fault.
    if (error instanceof VideoGenerationLimitError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Could not start memoir video:", error);
    return serverError(
      error instanceof Error ? error.message : "Could not start the video.",
    );
  }
}
