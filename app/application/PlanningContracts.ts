import type { VerificationClaimKind, VerificationClaimQualifiers, VerificationTemporalRequirement } from "../../core/approval";

export const planningVerificationClaimMaximum = 12;
export type PlanningVerificationClaimDraft = Readonly<{
  field: string;
  kind: VerificationClaimKind;
  statement: string;
  rawValue?: string;
  qualifiers: VerificationClaimQualifiers;
  temporalRequirement: VerificationTemporalRequirement;
  required: boolean;
  policyId?: string;
}>;

const temporalRequirement = {
  type: "object",
  additionalProperties: false,
  required: ["mode"],
  properties: {
    mode: { type: "string", enum: ["current", "asOf", "period", "notRequired", "unknown"] },
    date: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
  },
} as const;

const verificationClaims = {
  type: "array",
  maxItems: planningVerificationClaimMaximum,
  items: {
    type: "object", additionalProperties: false,
    required: ["field", "kind", "statement", "qualifiers", "temporalRequirement", "required"],
    properties: {
      field: { type: "string" },
      kind: { type: "string", enum: ["money", "ratio", "date", "dateRange", "duration", "location", "eligibility", "legal", "general"] },
      statement: { type: "string" }, rawValue: { type: "string" },
      qualifiers: { type: "object", additionalProperties: false, properties: { subject: { type: "string" }, scope: { type: "string" }, basis: { type: "string" }, note: { type: "string" } } },
      temporalRequirement,
      required: { type: "boolean" }, policyId: { type: "string" },
    },
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
  return Object.freeze({
    ...existingSchema,
    schema: Object.freeze({
      ...schema,
      properties: Object.freeze({
        ...schema.properties,
        opportunityCandidates: Object.freeze({ ...candidates, items: Object.freeze({ ...item, required: Object.freeze([...item.required, "verificationClaims"]), properties: Object.freeze({ ...item.properties, verificationClaims }) }) }),
      }),
    }),
  });
}

export const explicitPlanningFormat = extendPlanningSchemaWithVerificationClaims(planningOutputFormat);
export const explicitPlanningOutputFormat = explicitPlanningFormat;
