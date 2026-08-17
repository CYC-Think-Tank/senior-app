import "server-only";

import OpenAI from "openai";
import { CHAT_MODEL } from "@/lib/constants";
import {
  applySafetyOverride,
  fallbackAssessment,
  type AssistanceType,
  type ProviderType,
  type SafetyLevel,
  type SupportAssessment,
  type SupportPreference,
  type SupportUrgency,
} from "./matching";

const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "assistanceType",
    "urgency",
    "preferredLanguage",
    "requiredSkills",
    "safetyLevel",
    "recommendedTier",
    "summary",
    "safetyReason",
    "shareSummary",
  ],
  properties: {
    assistanceType: { type: "string", enum: ["technology", "companionship", "appointments", "daily_tasks", "other"] },
    urgency: { type: "string", enum: ["routine", "soon", "urgent", "emergency"] },
    preferredLanguage: { type: "string" },
    requiredSkills: { type: "array", items: { type: "string" }, maxItems: 8 },
    safetyLevel: { type: "string", enum: ["volunteer_eligible", "staff_required", "emergency"] },
    recommendedTier: { type: "string", enum: ["high_school", "college", "staff", "emergency"] },
    summary: { type: "string", maxLength: 240 },
    safetyReason: { type: "string", maxLength: 240 },
    shareSummary: { type: "string", maxLength: 180 },
  },
} as const;

const assistanceTypes: AssistanceType[] = ["technology", "companionship", "appointments", "daily_tasks", "other"];
const urgencies: SupportUrgency[] = ["routine", "soon", "urgent", "emergency"];
const safetyLevels: SafetyLevel[] = ["volunteer_eligible", "staff_required", "emergency"];
const tiers: Array<ProviderType | "emergency"> = ["high_school", "college", "staff", "emergency"];

function isAssessment(value: unknown): value is SupportAssessment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return assistanceTypes.includes(candidate.assistanceType as AssistanceType)
    && urgencies.includes(candidate.urgency as SupportUrgency)
    && safetyLevels.includes(candidate.safetyLevel as SafetyLevel)
    && tiers.includes(candidate.recommendedTier as ProviderType | "emergency")
    && typeof candidate.preferredLanguage === "string"
    && Array.isArray(candidate.requiredSkills)
    && candidate.requiredSkills.every((skill) => typeof skill === "string")
    && typeof candidate.summary === "string"
    && typeof candidate.safetyReason === "string"
    && typeof candidate.shareSummary === "string";
}

export async function assessSupportRequest({
  request,
  language,
  preference,
  location,
  availability,
}: {
  request: string;
  language: string;
  preference: SupportPreference;
  location: string;
  availability: string;
}) {
  const fallback = fallbackAssessment({ request, language, preference });
  // Do not send text that may contain medical, financial, credential, or
  // emergency details to a model. The deterministic screen already has the
  // only safe answer for these requests: trained staff or emergency help.
  if (fallback.safetyLevel !== "volunteer_eligible") return fallback;
  if (!process.env.OPENAI_API_KEY) return fallback;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 25_000 });
  try {
    const response = await openai.responses.create({
      model: CHAT_MODEL,
      store: false,
      max_output_tokens: 700,
      instructions: [
        "You assess human-support requests from older adults for WiseShare.",
        "Use plain, respectful language. Extract only what the person said; do not invent facts.",
        "High-school volunteers may only handle low-risk companionship and basic digital help.",
        "Medication, medical decisions, financial transactions, passwords, banking, sensitive documents, or similar requests require trained staff.",
        "Immediate danger, serious symptoms, fire, overdose, self-harm, or inability to breathe is an emergency and must never be matched to a WiseShare helper.",
        "shareSummary must contain only the minimum information a helper needs. Never include passwords, financial details, medical details, addresses, or document numbers.",
      ].join("\n"),
      input: JSON.stringify({ request, language, preference, location, availability }),
      text: {
        format: { type: "json_schema", name: "support_assessment", strict: true, schema: assessmentSchema },
      },
    });
    const parsed: unknown = JSON.parse(response.output_text);
    return applySafetyOverride(isAssessment(parsed) ? parsed : fallback, request);
  } catch (cause) {
    console.error("support request assessment failed:", cause);
    return fallback;
  }
}
