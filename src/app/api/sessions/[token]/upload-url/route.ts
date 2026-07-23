import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RAW_BUCKET } from "@/lib/constants";
import { isValidAttemptId, partPath } from "@/lib/audio/parts";

/**
 * Issues a signed upload URL so the browser can push a chunk of the recording
 * straight to Supabase Storage without routing the blob through this server.
 * Called once per chunk while the interview runs; the parts are stitched into
 * the raw recording at finalize.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { contentType, part, attempt } = await request.json().catch(() => ({}));

  if (!Number.isInteger(part) || part < 0 || part > 10_000) {
    return NextResponse.json({ error: "Invalid part." }, { status: 400 });
  }
  // Stamped here rather than in the browser: a guest's device clock cannot be
  // trusted to order one attempt after another.
  const attemptId = isValidAttemptId(attempt) ? attempt : Date.now();

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

  const ext =
    typeof contentType === "string" && contentType.includes("mp4")
      ? "m4a"
      : "webm";
  const path = partPath(session.id, attemptId, part, ext);

  const { data, error } = await admin.storage
    .from(RAW_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    console.error("createSignedUploadUrl failed:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    path: data.path,
    uploadToken: data.token,
    attempt: attemptId,
  });
}
