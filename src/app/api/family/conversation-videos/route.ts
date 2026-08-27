import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getVideoGenerationQuota,
  progressConversationVideo,
  publicConversationVideo,
  startConversationVideo,
  VideoGenerationLimitError,
} from "@/lib/memoir/workflow";
import { isSeegenConfigured } from "@/lib/memoir/seedance";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { sessionId, regenerate, repair } = await request.json() as {
      sessionId?: string;
      regenerate?: boolean;
      repair?: boolean;
    };
    if (!sessionId) return NextResponse.json({ error: "A conversation is required." }, { status: 400 });
    if (!isSeegenConfigured()) {
      return NextResponse.json(
        { error: "Video generation is not configured yet. Add SEEGEN_API_KEY and restart the app." },
        { status: 503 },
      );
    }
    const { supabase, user } = await requireUser();
    const { data: session } = await supabase
      .from("sessions")
      .select("id, guests!inner(user_id)")
      .eq("id", sessionId)
      .eq("status", "ready")
      .eq("guests.user_id", user.id)
      .single();
    if (!session) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const video = await startConversationVideo(sessionId, {
      userId: user.id,
      regenerate: regenerate === true,
      repair: repair === true,
    });
    if (["planning", "generating", "rendering"].includes(video.status)) {
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
      quota: await getVideoGenerationQuota(supabase, user.id),
    });
  } catch (error) {
    // Running out of films is an answer, not a fault: say so with a 403 so
    // the dashboard can show the allowance instead of an error.
    if (error instanceof VideoGenerationLimitError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Could not start memoir video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the video." },
      { status: 500 },
    );
  }
}
