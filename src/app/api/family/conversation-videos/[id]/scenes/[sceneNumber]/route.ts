import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ownedConversationVideo } from "@/lib/authz";
import {
  progressConversationVideo,
  publicConversationVideo,
  regenerateConversationVideoScene,
  VideoSceneRegenerationLimitError,
} from "@/lib/memoir/workflow";
import { isSeegenConfigured } from "@/lib/memoir/seedance";
import type { ConversationVideo } from "@/lib/types";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string; sceneNumber: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id, sceneNumber: rawSceneNumber } = await params;
    const sceneNumber = Number(rawSceneNumber);
    if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
      return NextResponse.json({ error: "Choose a valid scene." }, { status: 400 });
    }
    if (!isSeegenConfigured()) {
      return NextResponse.json(
        { error: "Video generation is not configured yet." },
        { status: 503 },
      );
    }

    const { user } = await requireUser();
    // Limits this to films belonging to the signed-in storyteller. The
    // `ready` check is what makes "still processing" and "not yours" look the
    // same from outside; the claim inside the database re-checks it anyway.
    const owned = await ownedConversationVideo(user.id, id);
    if (!owned || owned.status !== "ready") {
      return NextResponse.json({ error: "Video not found or is still processing." }, { status: 404 });
    }

    const video = await regenerateConversationVideoScene(id, sceneNumber);
    after(async () => {
      try {
        await progressConversationVideo(id);
      } catch (error) {
        console.error("Could not continue scene regeneration after responding:", error);
      }
    });

    return NextResponse.json({
      video: await publicConversationVideo(video as ConversationVideo),
    });
  } catch (error) {
    if (error instanceof VideoSceneRegenerationLimitError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Could not regenerate memoir scene:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not regenerate the scene." },
      { status: 500 },
    );
  }
}
