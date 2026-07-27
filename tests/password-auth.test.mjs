import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_MIN_LENGTH,
  validateNewPassword,
} from "../src/lib/password.ts";

test("new passwords require at least eight characters", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(validateNewPassword("short"), "Use at least 8 characters for your password.");
  assert.equal(validateNewPassword("eight888"), null);
});
