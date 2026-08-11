import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Guest memory contains a compact index of a person's life, which is even
 * easier to scan in bulk than a transcript. Give it its own key material and
 * bind every ciphertext to its guest so rows cannot be swapped.
 *
 *   FSM1.<base64url( IV (12B) | GCM tag (16B) | ciphertext )>
 */
const PREFIX = "FSM1.";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function memoryKey(): Buffer {
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

  cachedKey = Buffer.from(hkdfSync("sha256", master, "", "guest-memory", 32));
  return cachedKey;
}

function memoryAad(guestId: string): Buffer {
  return Buffer.from(`guest-memory:${guestId}`, "utf8");
}

export function isEncryptedGuestMemory(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptGuestMemory(guestId: string, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", memoryKey(), iv);
  cipher.setAAD(memoryAad(guestId));
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
  );
}

export function decryptGuestMemory(guestId: string, stored: string): string {
  if (!isEncryptedGuestMemory(stored)) {
    throw new Error(`Memory for guest ${guestId} is not encrypted.`);
  }

  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error(`Memory for guest ${guestId} is truncated.`);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    memoryKey(),
    raw.subarray(0, IV_LENGTH)
  );
  decipher.setAAD(memoryAad(guestId));
  decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));

  return (
    decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH), undefined, "utf8") +
    decipher.final("utf8")
  );
}

