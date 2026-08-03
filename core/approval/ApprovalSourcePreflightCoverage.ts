import type { ConfirmedContentOpportunity, ContentDocument } from "../content";
import type { ApprovalEvidenceFact } from "./ApprovalReadiness";
import {
  approvalEvidenceClaimFieldsForSourceUrl,
  approvalFactMatchesPage,
  extractProfileApprovalFactsFromText,
  requiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicy";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import type { ApprovalSourcePage } from "./ApprovalEvidenceVerification";

export type ApprovalSourcePreflightRequirement = Readonly<{
  field: string;
  plannedValue?: string;
}>;

export type ApprovalSourcePreflightCoverageSource = Readonly<{
  url: string;
  coveredClaimFields: readonly string[];
  rejectedClaimFields: readonly string[];
}>;

export type ApprovalSourcePreflightCoverageResult = Readonly<{
  status: "not_required" | "covered" | "incomplete";
  requiredClaims: readonly ApprovalSourcePreflightRequirement[];
  coveredClaimFields: readonly string[];
  uncoveredClaimFields: readonly string[];
  sources: readonly ApprovalSourcePreflightCoverageSource[];
}>;

export function requiredApprovalSourcePreflightClaims(
  opportunity: ConfirmedContentOpportunity,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalSourcePreflightRequirement[] {
  if (profileId === "tistory_vivarain_art_v1") {
    return Object.freeze(artRequiredClaimFields.map((field) => Object.freeze({ field })));
  }

  const facts = explicitPlanningFacts(opportunity, profileId);
  const factByField = new Map(facts.map((fact) => [fact.field, fact]));
  const planningDocument: ContentDocument = Object.freeze({
    id: opportunity.contentId,
    title: opportunity.selectedTopic,
    blocks: Object.freeze([Object.freeze({
      id: "approval-source-preflight-planning",
      type: "paragraph" as const,
      text: planningScopeText(opportunity),
    })]),
  });
  const baseFields = requiredApprovalFactFields(planningDocument, profileId, facts);
  const fields = isGenericFallback(baseFields, facts)
    ? genericPlanningClaimFields(opportunity, facts)
    : baseFields;

  return Object.freeze(unique(fields)
    .filter(isEvidenceClaimField)
    .map((field) => {
      const plannedValue = factByField.get(field)?.value.trim();
      return Object.freeze({
        field,
        ...(plannedValue ? { plannedValue } : {}),
      });
    }));
}

export function evaluateApprovalSourcePreflightCoverage(input: Readonly<{
  profileId: ApprovalPolicyProfileId;
  opportunity: ConfirmedContentOpportunity;
  sources: readonly Readonly<{
    page: ApprovalSourcePage;
    claims?: readonly Readonly<{ field: string; value: string }>[];
  }>[];
  requiredClaims?: readonly ApprovalSourcePreflightRequirement[];
}>): ApprovalSourcePreflightCoverageResult {
  const requiredClaims = Object.freeze([
    ...(input.requiredClaims
      ?? requiredApprovalSourcePreflightClaims(input.opportunity, input.profileId)),
  ]);
  const requiredByField = new Map(requiredClaims.map((claim) => [claim.field, claim]));
  const covered = new Set<string>();

  const sources = input.sources.map(({ page, claims = [] }) => {
    const roleFields = unique([
      ...(approvalEvidenceClaimFieldsForSourceUrl(page.requestedUrl) ?? []),
      ...(approvalEvidenceClaimFieldsForSourceUrl(page.finalUrl) ?? []),
    ]);
    const roleSet = new Set(roleFields);
    const candidates = new Map<string, ApprovalEvidenceFact>();

    for (const claim of claims) {
      if (!requiredByField.has(claim.field) || !claim.value.trim()) continue;
      if (roleFields.length > 0 && !roleSet.has(claim.field)) continue;
      candidates.set(claim.field, Object.freeze({
        field: claim.field,
        value: claim.value.trim(),
      }));
    }

    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const requirement of requiredClaims) {
      const fact = candidates.get(requirement.field);
      if (!fact) {
        rejected.push(requirement.field);
        continue;
      }
      if (preflightFactMatchesPage(page, fact, roleSet)) {
        accepted.push(fact.field);
        covered.add(fact.field);
      } else {
        rejected.push(fact.field);
      }
    }

    return Object.freeze({
      url: page.finalUrl || page.requestedUrl,
      coveredClaimFields: Object.freeze(unique(accepted)),
      rejectedClaimFields: Object.freeze(unique(rejected)),
    });
  });

  const coveredClaimFields = requiredClaims
    .map((claim) => claim.field)
    .filter((field) => covered.has(field));
  const uncoveredClaimFields = requiredClaims
    .map((claim) => claim.field)
    .filter((field) => !covered.has(field));
  const status = requiredClaims.length === 0
    ? "not_required" as const
    : uncoveredClaimFields.length === 0
      ? "covered" as const
      : "incomplete" as const;

  return Object.freeze({
    status,
    requiredClaims,
    coveredClaimFields: Object.freeze(coveredClaimFields),
    uncoveredClaimFields: Object.freeze(uncoveredClaimFields),
    sources: Object.freeze(sources),
  });
}

function explicitPlanningFacts(
  opportunity: ConfirmedContentOpportunity,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  const found = new Map<string, ApprovalEvidenceFact>();
  for (const segment of opportunity.expectedCoverage) {
    for (const fact of extractProfileApprovalFactsFromText(segment, profileId)) {
      const key = `${fact.field}:${normalizeComparable(fact.value)}`;
      if (!found.has(key)) found.set(key, fact);
    }
  }
  return Object.freeze([...found.values()]);
}

function genericPlanningClaimFields(
  opportunity: ConfirmedContentOpportunity,
  facts: readonly ApprovalEvidenceFact[],
): readonly string[] {
  const fields = new Set(facts.map((fact) => fact.field).filter(isEvidenceClaimField));
  const text = [
    opportunity.selectedTopic,
    opportunity.primaryKeyword,
    ...opportunity.secondaryKeywords,
    opportunity.searchIntent,
    opportunity.readerProblem,
    ...opportunity.expectedCoverage,
  ].join("\n");

  for (const [field, pattern] of genericPlanningSignals) {
    if (pattern.test(text)) fields.add(field);
  }
  return Object.freeze([...fields]);
}

function planningScopeText(opportunity: ConfirmedContentOpportunity): string {
  return [
    opportunity.selectedTopic,
    opportunity.primaryKeyword,
    ...opportunity.secondaryKeywords,
    opportunity.searchIntent,
    opportunity.readerProblem,
    ...opportunity.expectedCoverage,
  ].filter(Boolean).join("\n");
}

function isGenericFallback(
  fields: readonly string[],
  facts: readonly ApprovalEvidenceFact[],
): boolean {
  const available = new Set(facts.map((fact) => fact.field));
  return fields.length === 2
    && fields.includes("eligibility")
    && fields.includes("statutoryBasis")
    && (!available.has("eligibility") || !available.has("statutoryBasis"));
}

function preflightFactMatchesPage(
  page: ApprovalSourcePage,
  fact: ApprovalEvidenceFact,
  roleFields: ReadonlySet<string>,
): boolean {
  if (approvalFactMatchesPage(page, fact)) return true;
  if (!roleFields.has(fact.field)) return false;
  const value = normalizeComparable(fact.value);
  if (value.length < 2) return false;
  const pageText = normalizeComparable([
    page.title,
    page.publisher,
    page.text,
    page.requestedUrl,
    page.finalUrl,
  ].join(" "));
  return pageText.includes(value);
}

function isEvidenceClaimField(field: string): boolean {
  return !nonEvidenceClaimFields.has(field);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

const artRequiredClaimFields = Object.freeze([
  "artworkTitle",
  "creationYear",
  "medium",
  "dimensions",
  "holdingInstitution",
]);

const genericPlanningSignals = Object.freeze([
  Object.freeze(["eligibility", /지원\s*대상|신청\s*대상|지급\s*대상|적용\s*대상/u] as const),
  Object.freeze(["period", /신청\s*기간|적용\s*기간|지급\s*기간/u] as const),
  Object.freeze(["amount", /지원\s*금액|지급액|금액|한도/u] as const),
  Object.freeze(["incomeThreshold", /소득\s*기준|기준\s*중위소득/u] as const),
  Object.freeze(["interestRate", /금리|이자율/u] as const),
  Object.freeze(["taxRate", /세율|공제율/u] as const),
  Object.freeze(["exceptions", /예외|제외\s*조건|주의\s*사항/u] as const),
  Object.freeze(["statutoryBasis", /법적\s*근거|법령|법률|시행령/u] as const),
] as const);

const nonEvidenceClaimFields = new Set([
  "citedContext",
  "depositProtectionTopic",
  "dimensionSignal",
  "retirementTopic",
  "revolvingTopic",
  "yearSignal",
]);
