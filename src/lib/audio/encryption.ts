import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * At-rest encryption for every audio object in storage — interview chunks and
 * stitched raw recordings — so the bucket holds only ciphertext and a leaked
 * storage credential exposes no recordings.
 *
 * Audio is encrypted in independent fixed-size blocks rather than as one
 * sealed blob. A recording runs to tens of megabytes, and a single blob would
 * have to be fetched and decrypted in full to serve any part of it: too big
 * for one serverless response, and ruinous for seeking, where the player asks
 * for a few seconds from the middle. Blocks let a byte range touch only the
 * blocks covering it.
 *
 *   header  "FSA2" | blockSize u32 | totalLength u64 | fileId (16B)   = 32B
 *   block   IV (12B) | GCM tag (16B) | ciphertext (blockSize, last short)
 *
 * Every block is sealed under AES-256-GCM with its index, the file id, and
 * the header's own fields as additional authenticated data. Per-block tags
 * alone would authenticate each block's contents while leaving the sequence
 * malleable — blocks could be reordered, dropped, or spliced in from another
 * recording. Binding that context means any such edit fails to decrypt, and
 * it covers the header fields too, which are otherwise plaintext.
 *
 * Two older layouts are still read: `FSA1`, a single sealed blob, and bare
 * plaintext from before encryption shipped. Both keep playing untouched and
 * are converted by scripts/encrypt-existing-audio.mjs.
 */

const MAGIC = Buffer.from("FSA2");
const LEGACY_MAGIC = Buffer.from("FSA1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const FILE_ID_LENGTH = 16;

/** Per-block framing: the IV and tag that precede each block's ciphertext. */
const BLOCK_OVERHEAD = IV_LENGTH + TAG_LENGTH;

/** Bytes of header before the first block. */
export const HEADER_LENGTH =
  MAGIC.length + 4 + 8 + FILE_ID_LENGTH;

const LEGACY_HEADER_LENGTH = LEGACY_MAGIC.length + IV_LENGTH + TAG_LENGTH;

/**
 * Plaintext bytes per block. At the 128kbps this app records at, 256KB is
 * ~16 seconds of audio — fine enough that a seek decrypts almost nothing
 * extra, coarse enough that the 28-byte framing is a rounding error (~0.01%).
 */
const BLOCK_SIZE = 256 * 1024;

let cachedKey: Buffer | null = null;

/**
 * AUDIO_ENCRYPTION_KEY is the one at-rest secret the app has — it also backs
 * transcript encryption, which derives its own subkey from it in
 * src/lib/transcript/encryption.ts. This module deliberately imports nothing
 * from the app: node runs it directly, from the tests and from the migration
 * scripts, where the `@/` alias does not resolve.
 */
function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.AUDIO_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "AUDIO_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("AUDIO_ENCRYPTION_KEY must be 32 bytes of base64.");
  }
  cachedKey = key;
  return key;
}

/** Signing audio URLs must not reuse the cipher key, so derive a subkey. */
function urlSigningKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), "", "audio-url-auth", 32));
}

export type AudioHeader = {
  blockSize: number;
  /** Length of the decrypted audio, which is what players are served. */
  totalLength: number;
  fileId: Buffer;
};

/**
 * The context every block is bound to. Because it carries the header's own
 * fields, editing the header invalidates every block rather than silently
 * changing how the file is parsed.
 */
function blockAad(header: AudioHeader, index: number): Buffer {
  const aad = Buffer.alloc(FILE_ID_LENGTH + 4 + 8 + 8);
  header.fileId.copy(aad, 0);
  aad.writeUInt32BE(header.blockSize, FILE_ID_LENGTH);
  aad.writeBigUInt64BE(BigInt(header.totalLength), FILE_ID_LENGTH + 4);
  aad.writeBigUInt64BE(BigInt(index), FILE_ID_LENGTH + 12);
  return aad;
}

export function isSegmentedAudio(buffer: Buffer): boolean {
  return readAudioHeader(buffer) !== null;
}

export function isEncryptedAudio(buffer: Buffer): boolean {
  return (
    isSegmentedAudio(buffer) ||
    (buffer.length >= LEGACY_HEADER_LENGTH &&
      buffer.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC))
  );
}

/** Parses the header off the front of a file, or its first 32 bytes. */
export function readAudioHeader(head: Buffer): AudioHeader | null {
  if (head.length < HEADER_LENGTH) return null;
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) return null;

  const blockSize = head.readUInt32BE(MAGIC.length);
  const totalLength = Number(head.readBigUInt64BE(MAGIC.length + 4));
  if (blockSize <= 0) return null;
  if (!Number.isSafeInteger(totalLength) || totalLength < 0) return null;

  return {
    blockSize,
    totalLength,
    fileId: Buffer.from(head.subarray(MAGIC.length + 12, HEADER_LENGTH)),
  };
}

export function blockCount(header: AudioHeader): number {
  return Math.ceil(header.totalLength / header.blockSize);
}

/** Byte offset of a block's framing within the encrypted file. */
export function blockOffset(header: AudioHeader, index: number): number {
  return HEADER_LENGTH + index * (BLOCK_OVERHEAD + header.blockSize);
}

/** Plaintext bytes in a block; only the last one is short. */
export function blockLength(header: AudioHeader, index: number): number {
  return Math.min(
    header.blockSize,
    Math.max(0, header.totalLength - index * header.blockSize)
  );
}

/**
 * The slice of the encrypted file holding every block that overlaps the
 * requested plaintext range, so a caller can fetch exactly those bytes.
 */
export function cipherRangeFor(
  header: AudioHeader,
  start: number,
  end: number
): { firstBlock: number; lastBlock: number; from: number; to: number } {
  const firstBlock = Math.floor(start / header.blockSize);
  const lastBlock = Math.floor(end / header.blockSize);
  return {
    firstBlock,
    lastBlock,
    from: blockOffset(header, firstBlock),
    to:
      blockOffset(header, lastBlock) +
      BLOCK_OVERHEAD +
      blockLength(header, lastBlock) -
      1,
  };
}

export function encryptAudio(plain: Buffer): Buffer {
  const key = masterKey();
  const header: AudioHeader = {
    blockSize: BLOCK_SIZE,
    totalLength: plain.length,
    fileId: randomBytes(FILE_ID_LENGTH),
  };

  const head = Buffer.alloc(HEADER_LENGTH);
  MAGIC.copy(head, 0);
  head.writeUInt32BE(header.blockSize, MAGIC.length);
  head.writeBigUInt64BE(BigInt(header.totalLength), MAGIC.length + 4);
  header.fileId.copy(head, MAGIC.length + 12);

  const parts: Buffer[] = [head];
  for (let index = 0; index < blockCount(header); index++) {
    const from = index * header.blockSize;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(blockAad(header, index));
    const body = Buffer.concat([
      cipher.update(plain.subarray(from, from + header.blockSize)),
      cipher.final(),
    ]);
    parts.push(iv, cipher.getAuthTag(), body);
  }

  return Buffer.concat(parts);
}

/**
 * Decrypts one block out of `slice`, a region of the encrypted file that
 * begins at byte `sliceOffset`. Passing the whole file with an offset of 0
 * works; so does passing only the bytes a range request needed.
 */
export function decryptBlock(
  slice: Buffer,
  sliceOffset: number,
  header: AudioHeader,
  index: number
): Buffer {
  const at = blockOffset(header, index) - sliceOffset;
  const length = blockLength(header, index);
  if (at < 0 || at + BLOCK_OVERHEAD + length > slice.length) {
    throw new Error(`Encrypted audio is missing block ${index}.`);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    slice.subarray(at, at + IV_LENGTH)
  );
  decipher.setAAD(blockAad(header, index));
  decipher.setAuthTag(slice.subarray(at + IV_LENGTH, at + BLOCK_OVERHEAD));
  return Buffer.concat([
    decipher.update(
      slice.subarray(at + BLOCK_OVERHEAD, at + BLOCK_OVERHEAD + length)
    ),
    decipher.final(),
  ]);
}

/**
 * Decrypts a whole stored object. Used by the paths that need the entire file
 * anyway — stitching, rendering, migration. Legacy plaintext is returned
 * unchanged so objects predating encryption keep working.
 */
export function decryptAudio(stored: Buffer): Buffer {
  const header = readAudioHeader(stored);
  if (header) {
    const blocks: Buffer[] = [];
    for (let index = 0; index < blockCount(header); index++) {
      blocks.push(decryptBlock(stored, 0, header, index));
    }
    return Buffer.concat(blocks, header.totalLength);
  }

  if (
    stored.length >= LEGACY_HEADER_LENGTH &&
    stored.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC)
  ) {
    const iv = stored.subarray(
      LEGACY_MAGIC.length,
      LEGACY_MAGIC.length + IV_LENGTH
    );
    const tag = stored.subarray(
      LEGACY_MAGIC.length + IV_LENGTH,
      LEGACY_HEADER_LENGTH
    );
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(stored.subarray(LEGACY_HEADER_LENGTH)),
      decipher.final(),
    ]);
  }

  return stored;
}

/**
 * Encrypted objects cannot be served by Supabase's signed URLs — nothing
 * would decrypt them — so pages mint these HMAC-signed tokens instead and
 * /api/audio/[token] decrypts and streams the object they name.
 */
export type AudioGrant = { bucket: string; path: string };

export function createAudioUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number
): string {
  const payload = Buffer.from(
    JSON.stringify({
      b: bucket,
      p: path,
      exp: Date.now() + expiresInSeconds * 1000,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", urlSigningKey())
    .update(payload)
    .digest("base64url");
  return `/api/audio/${payload}.${sig}`;
}

/** Returns the grant a playback token names, or null if forged or expired. */
export function verifyAudioToken(token: string): AudioGrant | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", urlSigningKey())
    .update(payload)
    .digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return null;
  }

  try {
    const { b, p, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );
    if (typeof b !== "string" || typeof p !== "string") return null;
    if (typeof exp !== "number" || Date.now() > exp) return null;
    return { bucket: b, path: p };
  } catch {
    return null;
  }
}
