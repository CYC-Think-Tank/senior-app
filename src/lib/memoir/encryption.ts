import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const PREFIX = "FSM1.";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
let cachedKey: Buffer | null = null;

function memoirKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.AUDIO_ENCRYPTION_KEY;
  if (!raw) throw new Error("AUDIO_ENCRYPTION_KEY is not set.");
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) {
    throw new Error("AUDIO_ENCRYPTION_KEY must be 32 bytes of base64.");
  }
  cachedKey = Buffer.from(hkdfSync("sha256", master, "", "memoir-text", 32));
  return cachedKey;
}

function aad(videoId: string, field: string): Buffer {
  return Buffer.from(`${videoId}:${field}`, "utf8");
}

export function encryptMemoirText(
  videoId: string,
  field: string,
  text: string,
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", memoirKey(), iv);
  cipher.setAAD(aad(videoId, field));
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function decryptMemoirText(
  videoId: string,
  field: string,
  stored: string,
): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  if (raw.length < IV_LENGTH + TAG_LENGTH) throw new Error("Memoir text is truncated.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    memoirKey(),
    raw.subarray(0, IV_LENGTH),
  );
  decipher.setAAD(aad(videoId, field));
  decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH), undefined, "utf8") + decipher.final("utf8");
}
