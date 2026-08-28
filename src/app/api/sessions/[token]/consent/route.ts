import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

/** Records the storyteller's consent immediately before microphone access. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const [session] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }
  if (session.status === "ready") {
    return NextResponse.json({ error: "This interview is complete." }, { status: 409 });
  }

  try {
    await db
      .update(sessions)
      .set({ recordingConsentAt: new Date().toISOString() })
      .where(eq(sessions.id, session.id));
  } catch (error) {
    console.error("Could not save consent:", error);
    return NextResponse.json({ error: "Could not save consent." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
