import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RAW_BUCKET } from "@/lib/constants";

/**
 * Issues a signed upload URL so the browser can push the recording straight
 * to Supabase Storage without routing the (large) blob through this server.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { contentType } = await request.json().catch(() => ({}));

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, status")
    .eq("token", token)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }

  const ext =
    typeof contentType === "string" && contentType.includes("mp4")
      ? "m4a"
      : "webm";
  const path = `${session.id}/raw-${Date.now()}.${ext}`;

  const { data, error } = await admin.storage
    .from(RAW_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("createSignedUploadUrl failed:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload." },
      { status: 500 }
    );
  }

  return NextResponse.json({ path: data.path, uploadToken: data.token });
}
