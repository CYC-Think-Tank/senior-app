// Audits every object in the audio buckets and reports whether it is
// encrypted. Read-only — it never writes or deletes anything.
//
//   node --env-file=.env.local scripts/check-audio-encryption.mjs
//
// Exits non-zero if anything is still readable plaintext, so it can gate a
// deploy. Only the first 32 bytes of each object are read, via the same
// ranged-fetch path /api/audio/[token] uses, so this doubles as a check that
// byte-range reads work against your Supabase project.
import { createClient } from "@supabase/supabase-js";
import { HEADER_LENGTH, readAudioHeader } from "../src/lib/audio/encryption.ts";
import { fetchObjectRange } from "../src/lib/audio/object-range.ts";

const BUCKETS = ["raw-audio"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (try: node --env-file=.env.local ...)."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

/** Walks a bucket depth-first; Supabase list() is one folder level at a time. */
async function* listObjects(bucket, prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) return;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back with a null id.
      if (entry.id === null) yield* listObjects(bucket, path);
      else yield path;
    }
    if (data.length < 1000) return;
  }
}

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

function classify(head) {
  const header = readAudioHeader(head);
  if (header) {
    return {
      state: "encrypted",
      totalLength: header.totalLength,
      detail: `segmented, ${(header.totalLength / 1024 / 1024).toFixed(2)} MB of audio`,
    };
  }
  if (head.subarray(0, 4).equals(Buffer.from("FSA1"))) {
    return { state: "legacy", detail: "FSA1 — encrypted but not seekable" };
  }
  if (head.subarray(0, 4).equals(WEBM_MAGIC)) {
    return { state: "plaintext", detail: "readable WebM audio" };
  }
  if (head.subarray(4, 8).toString("latin1") === "ftyp") {
    return { state: "plaintext", detail: "readable MP4/m4a audio" };
  }
  if (head.subarray(0, 3).toString("latin1") === "ID3") {
    return { state: "plaintext", detail: "readable MP3 audio" };
  }
  return { state: "plaintext", detail: `unrecognised (${head.subarray(0, 4).toString("hex")})` };
}

// One request per object, so a bucket holding an interview's worth of chunks
// is checked in parallel rather than one round trip at a time.
const CONCURRENCY = 16;
const verbose = process.argv.includes("--verbose");

const totals = { encrypted: 0, legacy: 0, plaintext: 0 };
const problems = [];

async function checkAll(bucket, paths) {
  let next = 0;
  let audioBytes = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, paths.length) }, async () => {
      for (let i = next++; i < paths.length; i = next++) {
        const path = paths[i];
        const head = await fetchObjectRange(bucket, path, 0, HEADER_LENGTH - 1);
        if (head === null) continue;

        const { state, detail, totalLength } = classify(head);
        totals[state]++;
        audioBytes += totalLength ?? 0;
        if (state !== "encrypted") {
          problems.push(`${bucket}/${path} — ${detail}`);
          console.log(`  !! ${path} — ${detail}`);
        } else if (verbose) {
          console.log(`  ok ${path} — ${detail}`);
        }
      }
    })
  );
  return audioBytes;
}

for (const bucket of BUCKETS) {
  const paths = [];
  for await (const path of listObjects(bucket)) paths.push(path);
  process.stdout.write(`${bucket}: ${paths.length} objects... `);
  const audioBytes = await checkAll(bucket, paths);
  console.log(`${(audioBytes / 1024 / 1024).toFixed(1)} MB of audio`);
}

console.log(
  `\n${totals.encrypted} encrypted, ${totals.legacy} legacy (FSA1), ${totals.plaintext} plaintext.`
);

if (problems.length > 0) {
  console.log(
    `\n${problems.length} object(s) need converting. Run:\n` +
      `  node --env-file=.env.local scripts/encrypt-existing-audio.mjs`
  );
  process.exit(1);
}
console.log("Every stored recording is encrypted.");
