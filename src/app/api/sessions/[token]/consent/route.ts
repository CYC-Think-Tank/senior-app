import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Records the storyteller's consent immediately before microphone access. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
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
    return NextResponse.json({ error: "This interview is complete." }, { status: 409 });
  }

  const { error } = await admin
    .from("sessions")
    .update({ recording_consent_at: new Date().toISOString() })
    .eq("id", session.id);
  if (error) {
    return NextResponse.json({ error: "Could not save consent." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
