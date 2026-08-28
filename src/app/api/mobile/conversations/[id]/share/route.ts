import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { and, eq, isNull } from "drizzle-orm";
import { ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { siteOrigin } from "@/lib/mobile/origin";

export const dynamic = "force-dynamic";

/**
 * Creates (once) the permanent private share token for a finished
 * conversation. Port of `generateShareLink()`: the conversation has to be one
 * the caller recorded and finished before a link is minted for it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  if (!(await ownsReadySession(user.id, id))) {
    return notFound("This conversation could not be shared.");
  }

  const [session] = await db
    .select({ shareToken: sessions.shareToken })
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (!session) return notFound("This conversation could not be shared.");

  if (session.shareToken) {
    return NextResponse.json({
      shareToken: session.shareToken,
      shareUrl: `${siteOrigin(request)}/share/${session.shareToken}`,
    });
  }

  const token = randomBytes(24).toString("hex");
  let written;
  try {
    // Only fills an empty column, so two taps racing cannot replace a link
    // that has already been sent to somebody.
    [written] = await db
      .update(sessions)
      .set({ shareToken: token })
      .where(and(eq(sessions.id, id), isNull(sessions.shareToken)))
      .returning({ shareToken: sessions.shareToken });
  } catch (error) {
    console.error("Could not create a conversation share link:", error);
    return serverError("Could not create the link.");
  }

  const shareToken = written?.shareToken ?? token;
  return NextResponse.json({
    shareToken,
    shareUrl: `${siteOrigin(request)}/share/${shareToken}`,
  });
}
