import { NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { canReadConversationVideo } from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationVideos } from "@/lib/db/schema";
import { progressConversationVideo, publicConversationVideo } from "@/lib/memoir/workflow";
import type { ConversationVideo } from "@/lib/types";

export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireUser();
    const [found] = await db
      .select()
      .from(conversationVideos)
      .where(eq(conversationVideos.id, id))
      .limit(1);
    // The "storytellers read their conversation videos" policy, applied by
    // hand: the row is fetched unfiltered now, so the ownership check has to
    // happen here or every signed-in account could poll anyone's film.
    if (!found || !(await canReadConversationVideo(user.id, found.session_id))) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }
    const video = found as ConversationVideo;
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
