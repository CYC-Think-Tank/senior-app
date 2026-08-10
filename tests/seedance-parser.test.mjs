import assert from "node:assert/strict";
import test from "node:test";

const { findTaskId, findTaskStatus, findVideoUrl } = await import(
  "../src/lib/memoir/seedance-parser.ts"
);

test("Seedance task parser accepts SeeGen task responses", () => {
  assert.equal(findTaskId({ taskId: "task-1" }), "task-1");
  assert.equal(findTaskId({ data: { task_id: "task-2" } }), "task-2");
  assert.equal(findTaskStatus({ status: "COMPLETED" }), "completed");
  assert.equal(
    findVideoUrl({ output: [{ url: "https://cdn.example/video.mp4" }] }),
    "https://cdn.example/video.mp4",
  );
});
