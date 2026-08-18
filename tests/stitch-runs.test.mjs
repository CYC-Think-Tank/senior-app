import assert from "node:assert/strict";
import test from "node:test";

const { extensionOf, splitRuns } = await import("../src/lib/audio/part-runs.ts");

const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00]);
const WEBM_CLUSTER = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x00, 0x00, 0x00, 0x00]);
const MP4_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftyp", "latin1"),
]);
const MP4_FRAGMENT = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x10]),
  Buffer.from("moof", "latin1"),
]);
/** Raw PCM has no header at all — that is the whole point of the format. */
const PCM = Buffer.from([0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00]);

const named = (...names) => names;

test("the part extension is read back off the filename", () => {
  assert.equal(extensionOf("0000000000001-00000.webm"), "webm");
  assert.equal(extensionOf("0000000000001-00000.m4a"), "m4a");
  assert.equal(extensionOf("0000000000001-00000.pcm"), "pcm");
});

test("a browser sitting is one run behind its container header", () => {
  const runs = splitRuns(
    named("a-0.webm", "a-1.webm", "a-2.webm"),
    [WEBM_HEADER, WEBM_CLUSTER, WEBM_CLUSTER]
  );

  assert.equal(runs.length, 1);
  assert.equal(runs[0].ext, "webm");
  assert.equal(runs[0].buffers.length, 3);
});

test("a second container header opens a second sitting", () => {
  const runs = splitRuns(
    named("a-0.webm", "a-1.webm", "b-0.webm", "b-1.webm"),
    [WEBM_HEADER, WEBM_CLUSTER, WEBM_HEADER, WEBM_CLUSTER]
  );

  assert.deepEqual(
    runs.map((run) => run.buffers.length),
    [2, 2]
  );
});

test("fMP4 fragments group behind their init segment", () => {
  const runs = splitRuns(
    named("a-0.m4a", "a-1.m4a", "b-0.m4a"),
    [MP4_HEADER, MP4_FRAGMENT, MP4_HEADER]
  );

  assert.deepEqual(
    runs.map((run) => run.ext),
    ["m4a", "m4a"]
  );
  assert.deepEqual(
    runs.map((run) => run.buffers.length),
    [2, 1]
  );
});

test("headerless PCM chunks stay one run, however many sittings they span", () => {
  const runs = splitRuns(named("a-0.pcm", "a-1.pcm", "b-0.pcm"), [PCM, PCM, PCM]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].ext, "pcm");
  assert.equal(runs[0].buffers.length, 3);
});

test("a conversation started on the web and finished on iOS splits by format", () => {
  const runs = splitRuns(
    named("a-0.webm", "a-1.webm", "b-0.pcm", "b-1.pcm"),
    [WEBM_HEADER, WEBM_CLUSTER, PCM, PCM]
  );

  assert.deepEqual(
    runs.map((run) => run.ext),
    ["webm", "pcm"]
  );
  assert.deepEqual(
    runs.map((run) => run.buffers.length),
    [2, 2]
  );
});

test("PCM followed by a browser sitting also splits, despite the missing header", () => {
  const runs = splitRuns(
    named("a-0.pcm", "a-1.pcm", "b-0.webm"),
    [PCM, PCM, WEBM_HEADER]
  );

  assert.deepEqual(
    runs.map((run) => run.ext),
    ["pcm", "webm"]
  );
});
