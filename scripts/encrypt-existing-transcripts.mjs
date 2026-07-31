// One-time migration: seals every transcript turn written before transcript
// encryption shipped. Safe to re-run — rows already sealed are skipped, and
// only the `text` column is ever written.
//
//   node --env-file=.env.local scripts/encrypt-existing-transcripts.mjs
//
// Pass --check to only report what is still readable plaintext, writing
// nothing and exiting non-zero if any remains, so it can gate a deploy.
import { createClient } from "@supabase/supabase-js";
import {
  encryptTurnText,
  isEncryptedTurnText,
} from "../src/lib/transcript/encryption.ts";

const checkOnly = process.argv.includes("--check");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || (!checkOnly && !process.env.AUDIO_ENCRYPTION_KEY)) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AUDIO_ENCRYPTION_KEY (try: node --env-file=.env.local ...)."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

/**
 * Pages through every turn, oldest id first. Keyed on the last id rather than
 * an offset because the rows are being rewritten as we walk them.
 */
async function* listTurns() {
  for (let after = ""; ; ) {
    let query = admin
      .from("transcript_turns")
      .select("id, session_id, idx, text")
      .order("id", { ascending: true })
      .limit(500);
    if (after) query = query.gt("id", after);

    const { data, error } = await query;
    if (error) throw new Error(`list turns: ${error.message}`);
    if (!data || data.length === 0) return;
    yield* data;
    if (data.length < 500) return;
    after = data[data.length - 1].id;
  }
}

let converted = 0;
let skipped = 0;

for await (const turn of listTurns()) {
  if (isEncryptedTurnText(turn.text)) {
    skipped++;
    continue;
  }
  if (checkOnly) {
    console.log(`plaintext: session ${turn.session_id} turn ${turn.idx}`);
    converted++;
    continue;
  }

  const { error } = await admin
    .from("transcript_turns")
    .update({ text: encryptTurnText(turn.session_id, turn.idx, turn.text) })
    .eq("id", turn.id);
  if (error) throw new Error(`update turn ${turn.id}: ${error.message}`);
  converted++;
}

if (checkOnly) {
  console.log(`Checked: ${skipped} encrypted, ${converted} still plaintext.`);
  process.exit(converted === 0 ? 0 : 1);
}

console.log(`Done: ${converted} encrypted, ${skipped} already encrypted.`);
