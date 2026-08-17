import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RAW_BUCKET } from "@/lib/constants";
import { encryptAudio } from "@/lib/audio/encryption";
import { isValidAttemptId, partPath } from "@/lib/audio/parts";

/**
 * Receives one chunk of the in-progress recording, encrypts it, and stores it.
 * Called once per chunk while the interview runs; the parts are stitched into
 * the raw recording at finalize.
 *
 * Chunks used to go browser → storage via signed upload URLs, but that would
 * land plaintext in the bucket; only the server holds the encryption key, so
 * the ~160KB chunks now route through here.
 */

/**
 * Which container the chunks of this sitting are in.
 *
 * The browser sends whatever `MediaRecorder` produced — WebM/Opus, or fMP4 on
 * Safari. The iOS app has no `MediaRecorder`: it mixes both sides of the call
 * itself and sends the result as bare 24 kHz mono PCM16, which has no header
 * to stitch around and concatenates by simple byte order. `stitchSessionParts`
 * reads the extension back off the filename to know which it is dealing with.
 */
function extensionFor(contentType: string): string {
  if (contentType.includes("pcm") || contentType.includes("L16")) return "pcm";
  if (contentType.includes("mp4")) return "m4a";
  return "webm";
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const search = request.nextUrl.searchParams;
  const part = Number(search.get("part"));
  const contentType = search.get("contentType") ?? "";
  const attemptParam = Number(search.get("attempt"));

  if (!Number.isInteger(part) || part < 0 || part > 10_000) {
    return NextResponse.json({ error: "Invalid part." }, { status: 400 });
  }
  // Stamped here rather than in the browser: a guest's device clock cannot be
  // trusted to order one attempt after another.
  const attemptId = isValidAttemptId(attemptParam) ? attemptParam : Date.now();

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, status")
    .eq("token", token)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }
  if (session.status === "ready") {
    return NextResponse.json(
      { error: "This interview is already saved." },
      { status: 409 }
    );
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) {
    return NextResponse.json({ error: "Empty chunk." }, { status: 400 });
  }

  const path = partPath(session.id, attemptId, part, extensionFor(contentType));

  const { error } = await admin.storage
    .from(RAW_BUCKET)
    .upload(path, encryptAudio(body), {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (error) {
    console.error("part upload failed:", error);
    // The attempt id still goes back: the client pins it on the first reply
    // so a chunk that never lands cannot split the recording across two
    // attempts when it is retried.
    return NextResponse.json(
      { error: "Could not store the chunk.", attempt: attemptId },
      { status: 500 }
    );
  }

  return NextResponse.json({ attempt: attemptId });
}
