import assert from "node:assert/strict";
import test from "node:test";
import {
  applySafetyOverride,
  fallbackAssessment,
  rankProviders,
  safetyScreen,
} from "../src/lib/support/matching.ts";

test("basic iPhone help is eligible for a free student volunteer", () => {
  const assessment = fallbackAssessment({
    request: "Can someone teach me how to use my iPhone?",
    language: "Cantonese",
    preference: "no_preference",
  });

  assert.equal(assessment.assistanceType, "technology");
  assert.equal(assessment.safetyLevel, "volunteer_eligible");
  assert.equal(assessment.recommendedTier, "high_school");
  assert.deepEqual(assessment.requiredSkills, ["iPhone"]);
});

test("passwords and banking can never be routed to students", () => {
  for (const request of [
    "Please log in to my bank and transfer money.",
    "I forgot my email password and need someone to reset it.",
  ]) {
    const assessment = fallbackAssessment({
      request,
      language: "English",
      preference: "high_school",
    });
    assert.equal(assessment.safetyLevel, "staff_required");
    assert.equal(assessment.recommendedTier, "staff");
  }
});

test("deterministic safety overrides an unsafe model classification", () => {
  const modelAssessment = {
    assistanceType: "daily_tasks",
    urgency: "routine",
    preferredLanguage: "English",
    requiredSkills: [],
    safetyLevel: "volunteer_eligible",
    recommendedTier: "high_school",
    summary: "Help with a document.",
    safetyReason: "Low risk.",
    shareSummary: "Document help.",
  };
  const result = applySafetyOverride(
    modelAssessment,
    "Please help me complete a power of attorney document.",
  );
  assert.equal(result.safetyLevel, "staff_required");
  assert.equal(result.recommendedTier, "staff");
});

test("possible emergencies are not returned to the helper matcher", () => {
  const request = "I have chest pain and can't breathe.";
  assert.equal(safetyScreen(request).safetyLevel, "emergency");
  const assessment = fallbackAssessment({ request, language: "English", preference: "no_preference" });
  const matches = rankProviders({
    assessment,
    preference: "no_preference",
    mode: "either",
    location: "Toronto",
    providers: [{
      id: "provider-1",
      displayName: "Alex",
      providerType: "staff",
      languages: ["English"],
      skills: ["Emergency support"],
      interests: [],
      serviceModes: ["either"],
      locations: ["Toronto"],
      availability: "Now",
      successfulMatches: 50,
    }],
  });
  assert.deepEqual(matches, []);
});

test("matching rewards language, skills, mode, and the right provider tier", () => {
  const assessment = fallbackAssessment({
    request: "Teach me how to use my iPhone.",
    language: "Cantonese",
    preference: "no_preference",
  });
  const matches = rankProviders({
    assessment,
    preference: "no_preference",
    mode: "virtual",
    location: "Toronto",
    providers: [
      {
        id: "best",
        displayName: "May",
        providerType: "high_school",
        languages: ["Cantonese", "English"],
        skills: ["iPhone"],
        interests: ["Music"],
        serviceModes: ["virtual"],
        locations: ["Toronto"],
        availability: "Saturday afternoon",
        successfulMatches: 20,
      },
      {
        id: "other",
        displayName: "Sam",
        providerType: "college",
        languages: ["English"],
        skills: ["Android"],
        interests: [],
        serviceModes: ["nearby"],
        locations: ["Ottawa"],
        availability: "Monday morning",
        successfulMatches: 2,
      },
    ],
  });

  assert.equal(matches[0].provider.id, "best");
  assert.ok(matches[0].score >= 90);
});
