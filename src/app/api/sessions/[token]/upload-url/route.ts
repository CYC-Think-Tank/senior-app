import { NextResponse } from "next/server";

/**
 * Replaced by /api/sessions/[token]/upload-part, which encrypts chunks
 * server-side instead of letting the browser write plaintext to storage.
 * This file only still exists because the working tree couldn't be cleaned
 * up automatically — delete the whole upload-url directory.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Uploads moved to upload-part." },
    { status: 410 }
  );
}
