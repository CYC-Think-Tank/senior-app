import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncCycSeniorCareRegistrations } from "@/lib/support/cyc-sync";
import { WixCmsError } from "@/lib/wix-cms";

// A full sync pages through the Wix collection and writes one row at a time.
export const maxDuration = 300;

/**
 * Scheduled import of Senior Care sign-ups from thecyc.org into the WiseShare
 * support-worker roster. Run by Vercel Cron (see vercel.json), which sends
 * CRON_SECRET as a bearer token — without it set, this route refuses to run
 * rather than exposing an unauthenticated write.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("CRON_SECRET is not set; refusing to sync registrations.");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncCycSeniorCareRegistrations(
      createSupabaseAdminClient(),
    );
    console.info(
      `Synced ${result.fetched} Senior Care registration(s): ` +
        `${result.created} added, ${result.updated} refreshed, ${result.skipped} skipped.`,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not sync CYC registrations:", error);
    return NextResponse.json(
      { error: error instanceof WixCmsError ? error.message : "The sync failed." },
      { status: error instanceof WixCmsError ? error.status : 500 },
    );
  }
}
