import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
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
 * conversation. Port of `generateShareLink()`: the session is read through the
 * caller's RLS-scoped client first, and only then does the service role
 * persist the token.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, share_token, guests!inner(user_id)")
    .eq("id", id)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .maybeSingle();
  if (!session) return notFound("This conversation could not be shared.");

  if (session.share_token) {
    return NextResponse.json({
      shareToken: session.share_token,
      shareUrl: `${siteOrigin(request)}/share/${session.share_token}`,
    });
  }

  const token = randomBytes(24).toString("hex");
  const { error } = await admin
    .from("sessions")
    .update({ share_token: token })
    .eq("id", id)
    .is("share_token", null);

  if (error) {
    console.error("Could not create a conversation share link:", error);
    return serverError("Could not create the link.");
  }

  return NextResponse.json({
    shareToken: token,
    shareUrl: `${siteOrigin(request)}/share/${token}`,
  });
}
