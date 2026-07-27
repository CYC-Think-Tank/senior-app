import assert from "node:assert/strict";
import test from "node:test";
import {
  GUEST_FINISH_REASONS,
  GUEST_FINISH_TOOL,
  findGuestFinishToolCall,
  getInterviewClosingInstructions,
} from "../src/lib/realtime/interview-ending.ts";
import { buildInterviewerInstructions } from "../src/lib/realtime/interviewer-prompt.ts";

function responseWithFinishCall(argumentsValue) {
  return {
    id: "response-1",
    status: "completed",
    output: [
      {
        type: "function_call",
        name: GUEST_FINISH_TOOL.name,
        call_id: "call-1",
        arguments: argumentsValue,
      },
    ],
  };
}

test("accepts only the three guest-controlled finish reasons", () => {
  assert.deepEqual(GUEST_FINISH_REASONS, [
    "explicit_farewell",
    "explicit_stop_request",
    "confirmed_ready_to_finish",
  ]);
  assert.equal(GUEST_FINISH_REASONS.includes("natural_completion"), false);
  assert.deepEqual(
    GUEST_FINISH_TOOL.parameters.properties.reason.enum,
    GUEST_FINISH_REASONS
  );
});

test("extracts a valid guest-authorized finish tool call", () => {
  assert.deepEqual(
    findGuestFinishToolCall(
      responseWithFinishCall(
        JSON.stringify({ reason: "confirmed_ready_to_finish" })
      )
    ),
    {
      callId: "call-1",
      reason: "confirmed_ready_to_finish",
    }
  );
});

test("returns an invalid finish call for malformed or forbidden reasons", () => {
  assert.deepEqual(
    findGuestFinishToolCall(
      responseWithFinishCall(JSON.stringify({ reason: "natural_completion" }))
    ),
    { callId: "call-1", reason: null }
  );
  assert.deepEqual(
    findGuestFinishToolCall(responseWithFinishCall("{not-json")),
    { callId: "call-1", reason: null }
  );
});

test("ignores unrelated function calls", () => {
  const response = responseWithFinishCall(
    JSON.stringify({ reason: "explicit_farewell" })
  );
  response.output[0].name = "look_up_weather";
  assert.equal(findGuestFinishToolCall(response), null);
});

test("keeps natural endings guest-controlled in the interviewer prompt", () => {
  const prompt = buildInterviewerInstructions({ guestName: "Ada" });

  assert.match(prompt, /must NEVER decide to end the interview yourself/);
  assert.match(prompt, /ONLY when ALL of these are true/);
  assert.match(prompt, /Only if they clearly choose to finish/);
  assert.doesNotMatch(prompt, /after about 15–20 minutes/);
});

test("the automatic closing is brief and never asks another question", () => {
  const instructions = getInterviewClosingInstructions("brief_goodbye");

  assert.match(instructions, /no more than two short sentences/);
  assert.match(instructions, /Do not summarize, ask a question/);
});
