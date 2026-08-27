import { NextResponse, type NextRequest } from "next/server";
import { trashAbandonedAnonymousSessions } from "@/lib/sessions/trash";

// Deleting a batch means a storage listing and removal per session.
export const maxDuration = 300;

/**
 * Scheduled sweep of unfinished conversations from the public /interview flow.
 * Run by Vercel Cron (see vercel.json), which sends CRON_SECRET as a bearer
 * token — without it set, this route refuses to run at all rather than
 * exposing an unauthenticated delete.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("CRON_SECRET is not set; refusing to sweep.");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await trashAbandonedAnonymousSessions();

  if (result.errors.length > 0) {
    console.error("Anonymous sweep had failures:", result.errors);
  }
  console.info(
    `Trashed ${result.sessions} abandoned anonymous session(s), ` +
      `${result.guests} guest(s), ${result.objects} stored object(s).`
  );

  return NextResponse.json({
    sessions: result.sessions,
    guests: result.guests,
    objects: result.objects,
    errors: result.errors.length,
  });
}
