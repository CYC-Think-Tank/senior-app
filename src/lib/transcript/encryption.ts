import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * At-rest encryption for transcript text, so `transcript_turns` holds only
 * ciphertext and a leaked database credential — a stolen service-role key, a
 * dump, a support engineer with console access — exposes no one's stories.
 * The recordings were sealed first; the transcript is the same conversation
 * in a form that is far easier to read at scale.
 *
 * Each turn is sealed on its own rather than the transcript as one blob. Rows
 * are written one at a time (every checkpoint upserts by idx) and read back in
 * ranges, so a single blob would mean rewriting an hour of conversation on
 * every heartbeat. Only `text` is encrypted: idx, speaker, and timings stay
 * plaintext because the database orders, filters, and cuts audio by them.
 *
 *   FST1.<base64url( IV (12B) | GCM tag (16B) | ciphertext )>
 *
 * The turn's session and index are bound in as additional authenticated data.
 * Per-row tags alone would prove each turn's text was written by us while
 * leaving the arrangement malleable — rows could be reordered, or a turn from
 * one guest's session pasted into another's. Binding the slot means any such
 * move fails to decrypt rather than quietly rewriting what someone said.
 *
 * Text stored before this shipped is bare plaintext, has no prefix, and is
 * returned untouched; scripts/encrypt-existing-transcripts.mjs converts it.
 *
 * Like its audio counterpart this module imports nothing from the app: node
 * runs it directly, from the tests and from the migration script, where the
 * `@/` alias does not resolve.
 */

const PREFIX = "FST1.";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

/**
 * The transcript's own key, derived from the app's single at-rest secret
 * (spelled AUDIO_ENCRYPTION_KEY, since recordings were the first thing it
 * protected). Encrypting audio and encrypting transcripts are separate jobs
 * and never share key material.
 */
function textKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.AUDIO_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "AUDIO_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) {
    throw new Error("AUDIO_ENCRYPTION_KEY must be 32 bytes of base64.");
  }
  cachedKey = Buffer.from(
    hkdfSync("sha256", master, "", "transcript-text", 32)
  );
  return cachedKey;
}

/** The slot a turn's ciphertext is valid in, and nowhere else. */
function turnAad(sessionId: string, idx: number): Buffer {
  return Buffer.from(`${sessionId}:${idx}`, "utf8");
}

export function isEncryptedTurnText(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptTurnText(
  sessionId: string,
  idx: number,
  text: string
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", textKey(), iv);
  cipher.setAAD(turnAad(sessionId, idx));
  const body = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
  );
}

/**
 * Throws if the stored text has been tampered with or moved between turns.
 * A transcript that cannot be authenticated is not one to render half of.
 */
export function decryptTurnText(
  sessionId: string,
  idx: number,
  stored: string
): string {
  if (!isEncryptedTurnText(stored)) return stored;

  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error(`Turn ${idx} of session ${sessionId} is truncated.`);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    textKey(),
    raw.subarray(0, IV_LENGTH)
  );
  decipher.setAAD(turnAad(sessionId, idx));
  decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return (
    decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH), undefined, "utf8") +
    decipher.final("utf8")
  );
}

/**
 * Reverses what saveTurns wrote, for the rows a query just returned. Every
 * read path goes through here, so `text` is plaintext everywhere above the
 * database and ciphertext everywhere below it.
 */
export function decryptTurns<T extends { idx: number; text: string }>(
  sessionId: string,
  rows: T[]
): T[] {
  return rows.map((row) => ({
    ...row,
    text: decryptTurnText(sessionId, row.idx, row.text),
  }));
}
