import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";

const KEY = randomBytes(32);
process.env.AUDIO_ENCRYPTION_KEY = KEY.toString("base64");

const {
  HEADER_LENGTH,
  blockCount,
  blockLength,
  blockOffset,
  cipherRangeFor,
  createAudioUrl,
  decryptAudio,
  decryptBlock,
  encryptAudio,
  isEncryptedAudio,
  isSegmentedAudio,
  readAudioHeader,
  verifyAudioToken,
} = await import("../src/lib/audio/encryption.ts");

const BLOCK_SIZE = 256 * 1024;

/** Bigger than one block and deliberately not a block multiple. */
function sampleAudio() {
  return randomBytes(BLOCK_SIZE * 2 + 1234);
}

test("encrypting round-trips and hides the plaintext", () => {
  const plain = sampleAudio();
  const stored = encryptAudio(plain);

  assert.ok(isSegmentedAudio(stored));
  assert.ok(isEncryptedAudio(stored));
  assert.equal(stored.includes(plain.subarray(0, 32)), false);
  assert.deepEqual(decryptAudio(stored), plain);
});

test("the header describes the plaintext, not the stored bytes", () => {
  const plain = sampleAudio();
  const header = readAudioHeader(encryptAudio(plain));

  assert.equal(header.totalLength, plain.length);
  assert.equal(header.blockSize, BLOCK_SIZE);
  assert.equal(blockCount(header), 3);
  assert.equal(blockLength(header, 0), BLOCK_SIZE);
  assert.equal(blockLength(header, 2), 1234);
});

test("empty and single-block recordings round-trip", () => {
  for (const size of [0, 1, BLOCK_SIZE - 1, BLOCK_SIZE]) {
    const plain = randomBytes(size);
    assert.deepEqual(decryptAudio(encryptAudio(plain)), plain, `size ${size}`);
  }
});

test("a byte range decrypts from only the blocks it overlaps", () => {
  const plain = sampleAudio();
  const stored = encryptAudio(plain);
  const header = readAudioHeader(stored);

  // A range wholly inside the middle block must not need the others.
  const start = BLOCK_SIZE + 100;
  const end = BLOCK_SIZE + 999;
  const range = cipherRangeFor(header, start, end);
  assert.equal(range.firstBlock, 1);
  assert.equal(range.lastBlock, 1);

  // Hand decryptBlock only the slice a ranged fetch would have pulled.
  const slice = stored.subarray(range.from, range.to + 1);
  const block = decryptBlock(slice, range.from, header, 1);
  const offsetInBlock = start - BLOCK_SIZE;
  assert.deepEqual(
    block.subarray(offsetInBlock, offsetInBlock + 900),
    plain.subarray(start, end + 1)
  );
});

test("a range spanning blocks reassembles the exact bytes", () => {
  const plain = sampleAudio();
  const stored = encryptAudio(plain);
  const header = readAudioHeader(stored);

  const start = BLOCK_SIZE - 10;
  const end = BLOCK_SIZE * 2 + 5;
  const range = cipherRangeFor(header, start, end);
  const slice = stored.subarray(range.from, range.to + 1);

  const out = [];
  for (let i = range.firstBlock; i <= range.lastBlock; i++) {
    const block = decryptBlock(slice, range.from, header, i);
    const blockStart = i * BLOCK_SIZE;
    out.push(
      block.subarray(
        Math.max(0, start - blockStart),
        Math.min(block.length - 1, end - blockStart) + 1
      )
    );
  }
  assert.deepEqual(Buffer.concat(out), plain.subarray(start, end + 1));
});

test("block offsets stay inside the stored object", () => {
  const stored = encryptAudio(sampleAudio());
  const header = readAudioHeader(stored);
  const last = blockCount(header) - 1;
  assert.equal(blockOffset(header, 0), HEADER_LENGTH);
  assert.equal(
    blockOffset(header, last) + 28 + blockLength(header, last),
    stored.length
  );
});

test("a tampered block refuses to decrypt", () => {
  const stored = encryptAudio(sampleAudio());
  stored[stored.length - 1] ^= 0xff;
  assert.throws(() => decryptAudio(stored));
});

test("reordered blocks refuse to decrypt", () => {
  const stored = encryptAudio(sampleAudio());
  const header = readAudioHeader(stored);
  const size = 28 + BLOCK_SIZE;
  const first = Buffer.from(
    stored.subarray(blockOffset(header, 0), blockOffset(header, 0) + size)
  );
  const second = Buffer.from(
    stored.subarray(blockOffset(header, 1), blockOffset(header, 1) + size)
  );
  second.copy(stored, blockOffset(header, 0));
  first.copy(stored, blockOffset(header, 1));

  assert.throws(() => decryptAudio(stored));
});

test("a block spliced in from another recording refuses to decrypt", () => {
  const a = encryptAudio(sampleAudio());
  const b = encryptAudio(sampleAudio());
  const header = readAudioHeader(a);
  const at = blockOffset(header, 1);
  b.copy(a, at, at, at + 28 + BLOCK_SIZE);

  assert.throws(() => decryptAudio(a));
});

test("editing the header invalidates the blocks it describes", () => {
  const stored = encryptAudio(sampleAudio());
  // Truncating the declared length would otherwise silently drop the tail.
  stored.writeBigUInt64BE(BigInt(BLOCK_SIZE), 8);
  assert.throws(() => decryptAudio(stored));
});

/** Rebuilds the retired `FSA1` layout: magic + IV + tag + one sealed blob. */
function legacyEncrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("FSA1"), iv, cipher.getAuthTag(), body]);
}

test("FSA1 objects still decrypt and migrate into the segmented format", () => {
  const plain = randomBytes(300 * 1024);
  const legacy = legacyEncrypt(plain);

  assert.ok(isEncryptedAudio(legacy));
  assert.equal(isSegmentedAudio(legacy), false);
  assert.deepEqual(decryptAudio(legacy), plain);

  // Exactly what the migration script does to an FSA1 object.
  const migrated = encryptAudio(decryptAudio(legacy));
  assert.ok(isSegmentedAudio(migrated));
  assert.deepEqual(decryptAudio(migrated), plain);
});

test("a tampered FSA1 object refuses to decrypt", () => {
  const legacy = legacyEncrypt(randomBytes(1024));
  legacy[legacy.length - 1] ^= 0xff;
  assert.throws(() => decryptAudio(legacy));
});

test("legacy plaintext objects pass through decryption unchanged", () => {
  const legacy = Buffer.from("not encrypted webm bytes");
  assert.equal(isEncryptedAudio(legacy), false);
  assert.equal(isSegmentedAudio(legacy), false);
  assert.deepEqual(decryptAudio(legacy), legacy);
});

test("audio URLs verify and carry their bucket and path", () => {
  const url = createAudioUrl("raw-audio", "abc/raw-1.webm", 60);
  const token = url.replace("/api/audio/", "");
  assert.deepEqual(verifyAudioToken(token), {
    bucket: "raw-audio",
    path: "abc/raw-1.webm",
  });
});

test("expired and forged audio tokens are rejected", () => {
  const expired = createAudioUrl("raw-audio", "a.webm", -1).replace(
    "/api/audio/",
    ""
  );
  assert.equal(verifyAudioToken(expired), null);

  const good = createAudioUrl("raw-audio", "a.webm", 60).replace(
    "/api/audio/",
    ""
  );
  const [payload] = good.split(".");
  const other = Buffer.from(
    JSON.stringify({ b: "raw-audio", p: "b.webm", exp: Date.now() + 60_000 })
  ).toString("base64url");
  assert.equal(verifyAudioToken(`${other}.${good.split(".")[1]}`), null);
  assert.equal(verifyAudioToken(payload), null);
  assert.equal(verifyAudioToken(`${payload}.`), null);
});
