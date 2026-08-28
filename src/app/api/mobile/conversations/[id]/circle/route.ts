import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { eq } from "drizzle-orm";
import { ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import { circleShares } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Turns whole-circle sharing on or off for one finished conversation. Port of
 * `setCircleSharing()`.
 *
 * The ownership check keeps two other cases out without special-casing them:
 * an anonymous walk-in guest has no account to match, and an admin's blanket
 * access to sessions does not let them share someone else's story.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const shared = body.shared === true;

  if (!(await ownsReadySession(user.id, id))) {
    return notFound("This conversation could not be shared.");
  }

  try {
    if (shared) {
      await db
        .insert(circleShares)
        .values({ sessionId: id, ownerId: user.id })
        .onConflictDoNothing({ target: circleShares.sessionId });
    } else {
      await db.delete(circleShares).where(eq(circleShares.sessionId, id));
    }
  } catch (error) {
    console.error("Could not change circle sharing:", error);
    return serverError("Could not change sharing.");
  }

  return NextResponse.json({ ok: true, shared });
}
