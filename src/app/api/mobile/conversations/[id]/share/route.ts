import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, sessions } from "@/lib/db/schema";
import {
  notFound,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { siteOrigin } from "@/lib/mobile/origin";

export const dynamic = "force-dynamic";

/**
 * Creates (once) the permanent private share token for a finished
 * conversation. Port of `generateShareLink()`: ownership of the finished
 * conversation is established first, and only then is the token persisted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  const [session] = await db
    .select({ id: sessions.id, share_token: sessions.share_token })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(
      and(
        eq(sessions.id, id),
        eq(sessions.status, "ready"),
        eq(guests.user_id, user.id)
      )
    )
    .limit(1);
  if (!session) return notFound("This conversation could not be shared.");

  if (session.share_token) {
    return NextResponse.json({
      shareToken: session.share_token,
      shareUrl: `${siteOrigin(request)}/share/${session.share_token}`,
    });
  }

  const token = randomBytes(24).toString("hex");
  try {
    // `is null` keeps this a create-once: two taps in flight together cannot
    // replace a token someone may already have been sent.
    await db
      .update(sessions)
      .set({ share_token: token })
      .where(and(eq(sessions.id, id), isNull(sessions.share_token)));
  } catch (error) {
    console.error("Could not create a conversation share link:", error);
    return serverError("Could not create the link.");
  }

  return NextResponse.json({
    shareToken: token,
    shareUrl: `${siteOrigin(request)}/share/${token}`,
  });
}
