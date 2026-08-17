export type AssistanceType =
  | "technology"
  | "companionship"
  | "appointments"
  | "daily_tasks"
  | "other";

export type SupportUrgency = "routine" | "soon" | "urgent" | "emergency";
export type SafetyLevel = "volunteer_eligible" | "staff_required" | "emergency";
export type ProviderType = "high_school" | "college" | "staff";
export type SupportPreference = ProviderType | "no_preference";
export type ServiceMode = "virtual" | "nearby" | "either";

export type SupportAssessment = {
  assistanceType: AssistanceType;
  urgency: SupportUrgency;
  preferredLanguage: string;
  requiredSkills: string[];
  safetyLevel: SafetyLevel;
  recommendedTier: ProviderType | "emergency";
  summary: string;
  safetyReason: string;
  shareSummary: string;
};

export type SupportProvider = {
  id: string;
  displayName: string;
  providerType: ProviderType;
  languages: string[];
  skills: string[];
  interests: string[];
  serviceModes: ServiceMode[];
  locations: string[];
  availability: string;
  successfulMatches: number;
};

export type ProviderMatch = { provider: SupportProvider; score: number };

const emergencyTerms = [
  "emergency",
  "call 911",
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "not breathing",
  "immediate danger",
  "suicide",
  "kill myself",
  "overdose",
  "house is on fire",
  "fell and can't get up",
  "严重受伤",
  "不能呼吸",
  "胸痛",
  "自杀",
  "緊急情況",
  "無法呼吸",
  "胸口痛",
];

const staffOnlyTerms = [
  "medication",
  "medicine dose",
  "medical decision",
  "diagnosis",
  "bank",
  "banking",
  "wire money",
  "transfer money",
  "credit card",
  "financial transaction",
  "password",
  "pin number",
  "tax return",
  "passport",
  "social insurance number",
  "social security number",
  "power of attorney",
  "sensitive document",
  "药物",
  "用药",
  "银行",
  "密码",
  "信用卡",
  "護照",
  "藥物",
  "銀行",
  "密碼",
];

const normalise = (value: string) => value.trim().toLocaleLowerCase();

function includesTerm(text: string, terms: string[]) {
  const haystack = normalise(text);
  return terms.find((term) => haystack.includes(term));
}

export function safetyScreen(request: string): Pick<
  SupportAssessment,
  "safetyLevel" | "urgency" | "safetyReason"
> {
  const emergencyTerm = includesTerm(request, emergencyTerms);
  if (emergencyTerm) {
    return {
      safetyLevel: "emergency",
      urgency: "emergency",
      safetyReason: `Possible emergency language detected (${emergencyTerm}).`,
    };
  }

  const staffTerm = includesTerm(request, staffOnlyTerms);
  if (staffTerm) {
    return {
      safetyLevel: "staff_required",
      urgency: "soon",
      safetyReason: `This request may involve sensitive information or a regulated decision (${staffTerm}).`,
    };
  }

  return {
    safetyLevel: "volunteer_eligible",
    urgency: "routine",
    safetyReason: "No sensitive or emergency need was identified.",
  };
}

function inferAssistanceType(text: string): AssistanceType {
  const value = normalise(text);
  if (/(phone|iphone|android|zoom|whatsapp|tablet|computer|email|internet|technology|手机|手機|微信|电脑|電腦)/u.test(value)) {
    return "technology";
  }
  if (/(talk|lonely|company|conversation|game|reading|someone to listen|聊天|陪伴|孤独|孤獨)/u.test(value)) {
    return "companionship";
  }
  if (/(appointment|book a visit|schedule|预约|預約|约诊|約診)/u.test(value)) {
    return "appointments";
  }
  if (/(grocer|shopping|errand|form|letter|日常|购物|購物)/u.test(value)) {
    return "daily_tasks";
  }
  return "other";
}

function inferSkills(text: string, type: AssistanceType) {
  const value = normalise(text);
  const skills = new Set<string>();
  const skillTerms: Array<[RegExp, string]> = [
    [/(iphone|apple phone)/u, "iPhone"],
    [/(android)/u, "Android"],
    [/(zoom)/u, "Zoom"],
    [/(whatsapp)/u, "WhatsApp"],
    [/(email)/u, "Email"],
    [/(social media|facebook|instagram)/u, "Social media"],
    [/(appointment|schedule|预约|預約)/u, "Appointment booking"],
  ];
  for (const [pattern, label] of skillTerms) if (pattern.test(value)) skills.add(label);
  if (!skills.size && type === "technology") skills.add("Basic technology");
  if (type === "companionship") skills.add("Companionship");
  return [...skills];
}

export function fallbackAssessment({
  request,
  language,
  preference,
}: {
  request: string;
  language: string;
  preference: SupportPreference;
}): SupportAssessment {
  const safety = safetyScreen(request);
  const assistanceType = inferAssistanceType(request);
  const urgent = /\b(today|as soon as possible|asap|right away|urgent)\b/i.test(request);
  const urgency = safety.urgency === "routine" && urgent ? "urgent" : safety.urgency;
  const recommendedTier = safety.safetyLevel === "emergency"
    ? "emergency"
    : safety.safetyLevel === "staff_required"
      ? "staff"
      : preference === "staff" || preference === "college" || preference === "high_school"
        ? preference
        : assistanceType === "appointments" || assistanceType === "daily_tasks"
          ? "college"
          : "high_school";
  const requiredSkills = inferSkills(request, assistanceType);

  return {
    assistanceType,
    urgency,
    preferredLanguage: language,
    requiredSkills,
    safetyLevel: safety.safetyLevel,
    recommendedTier,
    summary: request.trim().slice(0, 240),
    safetyReason: safety.safetyReason,
    shareSummary: `${assistanceType.replace("_", " ")} help${requiredSkills.length ? ` with ${requiredSkills.join(", ")}` : ""}.`,
  };
}

/** Deterministic safety always wins over a model-generated classification. */
export function applySafetyOverride(
  assessment: SupportAssessment,
  request: string,
): SupportAssessment {
  const safety = safetyScreen(request);
  if (safety.safetyLevel === "emergency") {
    return {
      ...assessment,
      ...safety,
      recommendedTier: "emergency",
    };
  }
  if (safety.safetyLevel === "staff_required") {
    return {
      ...assessment,
      safetyLevel: "staff_required",
      safetyReason: safety.safetyReason,
      recommendedTier: "staff",
      urgency: assessment.urgency === "emergency" ? "urgent" : assessment.urgency,
    };
  }
  return assessment;
}

const overlap = (wanted: string[], offered: string[]) => {
  const offeredNormalised = offered.map(normalise);
  return wanted.filter((item) => offeredNormalised.includes(normalise(item))).length;
};

export function rankProviders({
  assessment,
  providers,
  preference,
  mode,
  location,
}: {
  assessment: SupportAssessment;
  providers: SupportProvider[];
  preference: SupportPreference;
  mode: ServiceMode;
  location: string;
}): ProviderMatch[] {
  if (assessment.safetyLevel === "emergency") return [];

  return providers
    .filter((provider) => {
      if (assessment.safetyLevel === "staff_required" && provider.providerType !== "staff") return false;
      if (preference !== "no_preference" && provider.providerType !== preference) return false;
      return true;
    })
    .map((provider) => {
      let score = 20;
      if (provider.providerType === assessment.recommendedTier) score += 15;
      if (provider.languages.some((language) => normalise(language) === normalise(assessment.preferredLanguage))) score += 25;
      if (mode === "either" || provider.serviceModes.includes(mode) || provider.serviceModes.includes("either")) score += 15;
      if (!location || mode === "virtual" || provider.locations.some((item) => normalise(item).includes(normalise(location)))) score += 5;
      score += Math.min(15, overlap(assessment.requiredSkills, provider.skills) * 7.5);
      score += Math.min(5, provider.successfulMatches / 10);
      return { provider, score: Math.min(100, Math.round(score)) };
    })
    .filter((match) => match.score >= 50)
    .sort((a, b) => b.score - a.score);
}
