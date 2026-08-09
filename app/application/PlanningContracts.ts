import type { VerificationClaimKind, VerificationClaimQualifiers, VerificationClaimRisk, VerificationTemporalRequirement } from "../../core/approval";

export const planningVerificationClaimMaximum = 12;
export type PlanningVerificationClaimAtomicity = "single_assertion";
export type PlanningVerificationClaimDraft = Readonly<{
  atomicity: PlanningVerificationClaimAtomicity;
  field: string;
  kind: VerificationClaimKind;
  statement: string;
  rawValue?: string;
  qualifiers: VerificationClaimQualifiers;
  temporalRequirement: VerificationTemporalRequirement;
  required: boolean;
  risk: VerificationClaimRisk;
  policyId?: string;
}>;

const temporalRequirement = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "date", "start", "end"],
  properties: {
    mode: { type: "string", enum: ["current", "asOf", "period", "notRequired", "unknown"] },
    date: { type: "string", description: "Use YYYY-MM-DD only for mode=asOf; otherwise return an empty string." },
    start: { type: "string", description: "Use YYYY-MM-DD only for mode=period; otherwise return an empty string." },
    end: { type: "string", description: "Use YYYY-MM-DD only for mode=period; otherwise return an empty string." },
  },
} as const;

const qualifierProperties = {
  subject: { type: "string", description: "Claim subject when explicitly known; otherwise return an empty string." },
  scope: { type: "string", description: "Claim scope when explicitly known; otherwise return an empty string." },
  basis: { type: "string", description: "Claim basis when explicitly known; otherwise return an empty string." },
  note: { type: "string", description: "Claim qualifier note when explicitly needed; otherwise return an empty string." },
} as const;

const verificationClaimProperties = {
  atomicity: { type: "string", enum: ["single_assertion"], description: "Exactly one independently verifiable factual assertion per Claim." },
  field: { type: "string" },
  kind: { type: "string", enum: ["money", "ratio", "date", "dateRange", "duration", "location", "eligibility", "legal", "general"] },
  statement: { type: "string" },
  rawValue: { type: "string", description: "Exact concrete value when the Claim has one; otherwise return an empty string." },
  qualifiers: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "scope", "basis", "note"],
    properties: qualifierProperties,
  },
  temporalRequirement,
  required: { type: "boolean" },
  risk: { type: "string", enum: ["verify", "critical"] },
  policyId: { type: "string", description: "Explicit policy identifier when supplied by Planning context; otherwise return an empty string." },
} as const;

const verificationClaims = {
  type: "array",
  maxItems: planningVerificationClaimMaximum,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["atomicity", "field", "kind", "statement", "rawValue", "qualifiers", "temporalRequirement", "required", "risk", "policyId"],
    properties: verificationClaimProperties,
  },
} as const;

const candidateProperties = {
  selectedTopic: { type: "string" }, primaryKeyword: { type: "string" }, secondaryKeywords: { type: "array", items: { type: "string" } },
  searchIntent: { type: "string" }, audience: { type: "string" }, contentType: { type: "string" }, contentAngle: { type: "string" }, readerProblem: { type: "string" },
  expectedCoverage: { type: "array", items: { type: "string" } }, coreQuestions: { type: "array", items: { type: "string" } }, requiredContentElements: { type: "array", items: { type: "string" } }, decisionCriteria: { type: "array", items: { type: "string" } }, examplesNeeded: { type: "array", items: { type: "string" } }, warningsOrExceptions: { type: "array", items: { type: "string" } }, actionableNextSteps: { type: "array", items: { type: "string" } }, comparisonNeeds: { type: "array", items: { type: "string" } },
  tableNeeds: { type: "boolean" }, checklistNeeds: { type: "boolean" }, scopeBoundaries: { type: "array", items: { type: "string" } }, topicComplexity: { type: "string", enum: ["low", "moderate", "high"] }, contentDepth: { type: "string", enum: ["standard", "deep", "comparison"] }, selectionRationale: { type: "string" }, opportunityEvidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["source", "summary"], properties: { source: { type: "string" }, summary: { type: "string" } } } }, confidence: { type: "number" }, cautions: { type: "array", items: { type: "string" } },
} as const;
const candidateRequired = Object.freeze(["selectedTopic", "primaryKeyword", "searchIntent", "audience", "contentType", "contentAngle", "readerProblem", "selectionRationale"]);

export const planningOutputFormat = {
  type: "json_schema", name: "content_planning", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["interpretedIntent", "domain", "targetAudience", "contentGoal", "recommendationReason"],
    properties: {
      interpretedIntent: { type: "string" }, domain: { type: "string" }, targetAudience: { type: "string" }, contentGoal: { type: "string" },
      recommendedPlatforms: { type: "array", items: { type: "string" } }, suggestedTitleAngles: { type: "array", items: { type: "string" } }, contentCluster: { type: "array", items: { type: "string" } }, recommendationReason: { type: "string" }, confidence: { type: "number" }, estimateDisclosure: { type: "string" },
      recommendedPrimaryKeyword: { type: "string" }, keywordCandidates: { type: "array", items: { type: "string" } }, searchIntent: { type: "string" }, recommendedContentType: { type: "string" }, relatedKeywords: { type: "array", items: { type: "string" } },
      opportunityCandidates: { type: "array", items: { type: "object", additionalProperties: false, required: candidateRequired, properties: candidateProperties } },
    },
  },
} as const;

export function extendPlanningSchemaWithVerificationClaims<T extends typeof planningOutputFormat>(existingSchema: T) {
  const schema = existingSchema.schema;
  const candidates = schema.properties.opportunityCandidates;
  const item = candidates.items;
  const explicitCandidateProperties = Object.freeze({ ...item.properties, verificationClaims });
  return Object.freeze({
    ...existingSchema,
    schema: Object.freeze({
      ...schema,
      required: Object.freeze(Object.keys(schema.properties)),
      properties: Object.freeze({
        ...schema.properties,
        opportunityCandidates: Object.freeze({
          ...candidates,
          items: Object.freeze({
            ...item,
            required: Object.freeze(Object.keys(explicitCandidateProperties)),
            properties: explicitCandidateProperties,
          }),
        }),
      }),
    }),
  });
}

export const explicitPlanningFormat = extendPlanningSchemaWithVerificationClaims(planningOutputFormat);
export const explicitPlanningOutputFormat = explicitPlanningFormat;
