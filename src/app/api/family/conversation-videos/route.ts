import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  progressConversationVideo,
  publicConversationVideo,
  startConversationVideo,
} from "@/lib/memoir/workflow";
import { isSeegenConfigured } from "@/lib/memoir/seedance";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { sessionId, regenerate } = await request.json() as {
      sessionId?: string;
      regenerate?: boolean;
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
    const video = await startConversationVideo(sessionId, { regenerate: regenerate === true });
    if (["planning", "generating", "rendering"].includes(video.status)) {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the video." },
      { status: 500 },
    );
  }
}
