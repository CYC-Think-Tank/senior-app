/**
 * Byte-range reads against Supabase Storage.
 *
 * The supabase-js `download()` helper always pulls a whole object, which for
 * an hour-long recording means moving ~54MB to serve a few seconds of audio.
 * Storage speaks HTTP Range on its object endpoint, so playback goes straight
 * there with the service-role key instead.
 */

function objectUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  // Each segment is encoded separately so the path separators survive.
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;
}

/**
 * Reads bytes `from`..`to` inclusive. Returns null when the object is missing;
 * a short buffer when the object ends before `to`, which is what a request for
 * the header of a small object gets.
 */
export async function fetchObjectRange(
  bucket: string,
  path: string,
  from: number,
  to: number
): Promise<Buffer | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  const res = await fetch(objectUrl(bucket, path), {
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      Range: `bytes=${from}-${to}`,
    },
    cache: "no-store",
  });

  if (res.status === 404) return null;
  // 200 means Range was ignored and the whole object came back; slicing keeps
  // the caller's contract either way.
  if (res.status === 206 || res.status === 200) {
    const body = Buffer.from(await res.arrayBuffer());
    return res.status === 200 ? body.subarray(from, to + 1) : body;
  }
  if (res.status === 416) return Buffer.alloc(0);

  throw new Error(
    `Storage range read failed for ${bucket}/${path}: HTTP ${res.status}`
  );
}
