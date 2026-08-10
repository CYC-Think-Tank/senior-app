import { NextResponse, type NextRequest } from "next/server";
import { progressPendingConversationVideos } from "@/lib/memoir/workflow";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await progressPendingConversationVideos();
  return NextResponse.json({ processed });
}
