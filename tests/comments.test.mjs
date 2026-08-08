import assert from "node:assert/strict";
import test from "node:test";
import { MAX_COMMENT_LENGTH, normalizeCommentBody } from "../src/lib/comments.ts";

test("normalizeCommentBody trims the ends", () => {
  assert.equal(normalizeCommentBody("  What a story.  "), "What a story.");
});

test("normalizeCommentBody treats blank input as nothing to save", () => {
  assert.equal(normalizeCommentBody("   "), null);
  assert.equal(normalizeCommentBody("\n\n\t"), null);
  assert.equal(normalizeCommentBody(""), null);
  assert.equal(normalizeCommentBody(null), null);
  assert.equal(normalizeCommentBody(undefined), null);
});

test("normalizeCommentBody keeps paragraphs but collapses longer runs", () => {
  assert.equal(
    normalizeCommentBody("First line.\n\nSecond line."),
    "First line.\n\nSecond line.",
  );
  assert.equal(
    normalizeCommentBody("First line.\n\n\n\n\nSecond line."),
    "First line.\n\nSecond line.",
  );
  assert.equal(normalizeCommentBody("a\r\nb"), "a\nb", "CRLF is normalised");
});

test("normalizeCommentBody clamps to the database's limit", () => {
  const long = "a".repeat(MAX_COMMENT_LENGTH + 1);
  const result = normalizeCommentBody(long);
  // The check constraint on conversation_comments.body rejects anything
  // longer, so this must clamp rather than hand the DB an oversized row.
  assert.equal(result.length, MAX_COMMENT_LENGTH);
});
