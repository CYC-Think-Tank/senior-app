import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { ownedConversationVideo } from "@/lib/authz";
import { progressConversationVideo, publicConversationVideo } from "@/lib/memoir/workflow";
import type { ConversationVideo } from "@/lib/types";

export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireUser();
    const owned = await ownedConversationVideo(user.id, id);
    if (!owned) return NextResponse.json({ error: "Video not found." }, { status: 404 });
    const video = owned as ConversationVideo;
    if (["planning", "generating", "rendering"].includes(video.status)) {
      after(async () => {
        try {
          await progressConversationVideo(id);
        } catch (error) {
          console.error("Could not continue memoir video after refreshing:", error);
        }
      });
    }
    return NextResponse.json({ video: await publicConversationVideo(video) });
  } catch (error) {
    console.error("Could not refresh memoir video:", error);
    return NextResponse.json({ error: "Could not refresh the video." }, { status: 500 });
  }
}
