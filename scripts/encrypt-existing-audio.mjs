// One-time migration: converts every audio object into the current segmented
// format — both plaintext from before encryption shipped and the earlier
// single-blob `FSA1` layout, which cannot serve byte ranges. Safe to re-run:
// objects already in the segmented format are skipped, and each is
// re-uploaded under its own path so nothing else changes.
//
//   node --env-file=.env.local scripts/encrypt-existing-audio.mjs
import { createClient } from "@supabase/supabase-js";
import {
  decryptAudio,
  encryptAudio,
  isSegmentedAudio,
} from "../src/lib/audio/encryption.ts";

const BUCKETS = ["raw-audio", "episodes"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.AUDIO_ENCRYPTION_KEY) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AUDIO_ENCRYPTION_KEY (try: node --env-file=.env.local ...)."
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

let converted = 0;
let skipped = 0;

for (const bucket of BUCKETS) {
  for await (const path of listObjects(bucket)) {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(`download ${bucket}/${path}: ${error?.message}`);
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    if (isSegmentedAudio(buffer)) {
      skipped++;
      continue;
    }
    // Reads plaintext and `FSA1` alike; writes the segmented format back.
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, encryptAudio(decryptAudio(buffer)), {
        contentType: "application/octet-stream",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`upload ${bucket}/${path}: ${uploadError.message}`);
    }
    converted++;
    console.log(`converted ${bucket}/${path}`);
  }
}

console.log(`Done: ${converted} converted, ${skipped} already segmented.`);
