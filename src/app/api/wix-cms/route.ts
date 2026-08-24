import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { queryWixCmsCollection, WixCmsError } from "@/lib/wix-cms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function hasValidToken(request: NextRequest): boolean {
  const expected = process.env.WIX_CMS_READ_TOKEN?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

/** Returns a page of rows from the configured Wix CMS collection. */
export async function GET(request: NextRequest) {
  if (!process.env.WIX_CMS_READ_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "WIX_CMS_READ_TOKEN is not configured." },
      { status: 503 },
    );
  }

  if (!hasValidToken(request)) {
    return NextResponse.json(
      { error: "A valid bearer token is required." },
      {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      },
    );
  }

  const limit = parseInteger(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT,
  );
  const offset = parseInteger(
    request.nextUrl.searchParams.get("offset"),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );

  if (limit === null || offset === null) {
    return NextResponse.json(
      {
        error: `limit must be between 1 and ${MAX_LIMIT}; offset must be zero or greater.`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await queryWixCmsCollection({ limit, offset });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Could not query Wix CMS:", error);
    if (error instanceof WixCmsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "The Wix CMS collection could not be read." },
      { status: 500 },
    );
  }
}
