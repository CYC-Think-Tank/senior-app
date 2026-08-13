import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  HEADER_LENGTH,
  cipherRangeFor,
  decryptAudio,
  decryptBlock,
  readAudioHeader,
  verifyAudioToken,
  type AudioHeader,
} from "@/lib/audio/encryption";
import { fetchObjectRange } from "@/lib/audio/object-range";

// Streaming keeps memory flat, but the clock covers time spent sending, so a
// slow connection on a long range still needs room. 300s is Hobby's ceiling.
export const maxDuration = 300;

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  webm: "audio/webm",
  mp4: "video/mp4",
};

/**
 * How much audio one ranged response will serve. Players ask for the whole
 * file up front (`Range: bytes=0-`) and are happy to be given a prefix, so
 * capping keeps every invocation short and every seek cheap instead of
 * streaming an hour of audio through one function call.
 */
const MAX_RANGE_BYTES = 4 * 1024 * 1024;

/**
 * How much ciphertext one storage read pulls in. A request with a Range header
 * never exceeds `MAX_RANGE_BYTES`, so playback still costs a single read. An
 * unranged request — what `<a download>` sends — has no such ceiling, so it
 * walks the object one window at a time instead of buffering the whole thing
 * and dropping it partway, which truncated saved files while playback worked.
 */
const READ_WINDOW_BYTES = MAX_RANGE_BYTES;

/**
 * Serves a stored audio object to the player, decrypting it on the way out.
 * The token is minted by a page that already did its own authorization
 * (family membership, admin role, share token), so possession of an
 * unexpired token is the entire access check here — exactly the contract the
 * Supabase signed URLs used to provide, but for objects only this server can
 * read.
 *
 * Encrypted audio is stored in independent blocks, so a range request reads
 * and decrypts only the blocks it overlaps and streams them out a block at a
 * time. Nothing here ever holds the whole recording, which is what keeps the
 * response inside Vercel's payload limits.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const grant = verifyAudioToken(token);
  if (!grant) {
    return NextResponse.json(
      { error: "This audio link is invalid or has expired." },
      { status: 403 }
    );
  }

  const contentType =
    MIME_BY_EXT[grant.path.split(".").pop() ?? ""] ?? "application/octet-stream";

  try {
    const head = await fetchObjectRange(
      grant.bucket,
      grant.path,
      0,
      HEADER_LENGTH - 1
    );
    if (head === null) {
      return NextResponse.json({ error: "Audio not found." }, { status: 404 });
    }

    const header = readAudioHeader(head);
    if (!header) {
      // Legacy single-blob or pre-encryption plaintext: no random access, so
      // fall back to reading the object whole. The migration script converts
      // these, after which this path stops being taken.
      return serveWholeObject(request, grant, contentType);
    }

    return serveSegmented(request, grant, header, contentType);
  } catch (err) {
    console.error("audio read failed:", grant.path, err);
    return NextResponse.json(
      { error: "The recording could not be read." },
      { status: 500 }
    );
  }
}

/** Parses a Range header against a known length; null means "send it all". */
function parseRange(
  request: NextRequest,
  totalLength: number
): { start: number; end: number } | null | "unsatisfiable" {
  const match = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;

  // A suffix range (`bytes=-500`) asks for the final N bytes.
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, totalLength - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), totalLength - 1)
      : totalLength - 1;

  if (start > end || start >= totalLength) return "unsatisfiable";
  // Serving a prefix of what was asked for is a valid 206 and is what keeps
  // `bytes=0-` from dragging the whole recording through one invocation.
  return { start, end: Math.min(end, start + MAX_RANGE_BYTES - 1) };
}

function rangeHeaders(
  contentType: string,
  length: number
): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=600",
    "Content-Length": String(length),
  };
}

/**
 * Streams the requested range of a segmented object, decrypting one block at
 * a time so only a block of plaintext is ever in memory.
 */
async function serveSegmented(
  request: NextRequest,
  grant: { bucket: string; path: string },
  header: AudioHeader,
  contentType: string
) {
  const total = header.totalLength;
  const range = parseRange(request, total);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : total - 1;
  if (total === 0) {
    return new NextResponse(null, { headers: rangeHeaders(contentType, 0) });
  }

  const { firstBlock, lastBlock } = cipherRangeFor(header, start, end);
  const blocksPerWindow = Math.max(
    1,
    Math.floor(READ_WINDOW_BYTES / header.blockSize)
  );

  let index = firstBlock;
  // The ciphertext currently in hand, and the offset it starts at. Refilled
  // whenever the block being served falls past its end.
  let window: { cipher: Buffer; from: number; lastBlock: number } | null = null;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index > lastBlock) {
        controller.close();
        return;
      }
      try {
        if (!window || index > window.lastBlock) {
          const windowLast = Math.min(lastBlock, index + blocksPerWindow - 1);
          const span = cipherRangeFor(
            header,
            index * header.blockSize,
            windowLast * header.blockSize
          );
          const cipher = await fetchObjectRange(
            grant.bucket,
            grant.path,
            span.from,
            span.to
          );
          // The object existed when its header was read moments ago, so a miss
          // here means it went away mid-stream. Headers are already sent.
          if (cipher === null) {
            throw new Error("The stored object disappeared mid-read.");
          }
          window = { cipher, from: span.from, lastBlock: windowLast };
        }
        const plain = decryptBlock(window.cipher, window.from, header, index);
        // Trim the first and last blocks down to the bytes actually asked for.
        const blockStart = index * header.blockSize;
        const sliceFrom = Math.max(0, start - blockStart);
        const sliceTo = Math.min(plain.length - 1, end - blockStart);
        controller.enqueue(
          new Uint8Array(plain.subarray(sliceFrom, sliceTo + 1))
        );
        index++;
      } catch (err) {
        console.error("audio decrypt failed:", grant.path, err);
        controller.error(err);
      }
    },
  });

  const length = end - start + 1;
  if (!range) {
    return new NextResponse(body, {
      headers: rangeHeaders(contentType, length),
    });
  }
  return new NextResponse(body, {
    status: 206,
    headers: {
      ...rangeHeaders(contentType, length),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
}

/** Whole-object path for objects written before the segmented format. */
async function serveWholeObject(
  request: NextRequest,
  grant: { bucket: string; path: string },
  contentType: string
) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(grant.bucket)
    .download(grant.path);
  if (error || !data) {
    return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  }

  const audio = decryptAudio(Buffer.from(await data.arrayBuffer()));
  const range = parseRange(request, audio.length);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${audio.length}` },
    });
  }

  if (!range) {
    return new NextResponse(new Uint8Array(audio), {
      headers: rangeHeaders(contentType, audio.length),
    });
  }
  return new NextResponse(
    new Uint8Array(audio.subarray(range.start, range.end + 1)),
    {
      status: 206,
      headers: {
        ...rangeHeaders(contentType, range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${audio.length}`,
      },
    }
  );
}
