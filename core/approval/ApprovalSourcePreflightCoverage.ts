import type { ConfirmedContentOpportunity } from "../content";
import {
  approvalEvidenceClaimFieldsForSourceUrl,
  approvalFactMatchesPage,
  extractProfileApprovalFactsFromText,
} from "./ApprovalEvidenceClaimPolicy";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import type { ApprovalSourcePage } from "./ApprovalEvidenceVerification";

export type ApprovalSourcePreflightRequirement = Readonly<{
  field: string;
  plannedValue?: string;
}>;

export type ApprovalSourcePreflightClaim = Readonly<{
  field: string;
  value: string;
  evidenceExcerpt: string;
}>;

export type ApprovalSourcePreflightCoverageSource = Readonly<{
  url: string;
  hintedClaimFields: readonly string[];
  coveredClaimFields: readonly string[];
  rejectedClaimFields: readonly string[];
}>;

export type ApprovalSourcePreflightCoverageStatus =
  | "covered"
  | "incomplete"
  | "not_required";

export type ApprovalSourcePreflightCoverageResult = Readonly<{
  status: ApprovalSourcePreflightCoverageStatus;
  requiredClaims: readonly ApprovalSourcePreflightRequirement[];
  coveredClaimFields: readonly string[];
  uncoveredClaimFields: readonly string[];
  sources: readonly ApprovalSourcePreflightCoverageSource[];
}>;

export function requiredApprovalSourcePreflightClaims(
  opportunity: ConfirmedContentOpportunity,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalSourcePreflightRequirement[] {
  const text = planningText(opportunity);
  const facts = extractProfileApprovalFactsFromText(text, profileId);
  const factsByField = new Map<string, string>();
  for (const fact of facts) {
    if (!factsByField.has(fact.field)) factsByField.set(fact.field, fact.value);
  }

  const required = new Map<string, ApprovalSourcePreflightRequirement>();
  const add = (field: string, plannedValue?: string) => {
    const normalizedField = field.trim();
    const normalizedValue = plannedValue?.replace(/\s+/gu, " ").trim();
    if (!normalizedField || required.has(normalizedField)) return;
    required.set(normalizedField, Object.freeze({
      field: normalizedField,
      ...(normalizedValue ? { plannedValue: normalizedValue } : {}),
    }));
  };
  const addKnown = (field: string) => add(field, factsByField.get(field));

  if (profileId === "tistory_vivarain_art_v1") {
    for (const field of artRequiredFields) addKnown(field);
    return Object.freeze([...required.values()]);
  }

  if (retirementTopicPattern.test(text)) {
    for (const field of retirementRequiredFields) addKnown(field);
    if (leaveTreatmentPattern.test(text)) addKnown("leaveTreatment");
    if (interimSettlementPattern.test(text)) addKnown("interimSettlement");
    if (statutoryBasisPattern.test(text)) addKnown("statutoryBasis");
  }

  if (depositProtectionTopicPattern.test(text)) {
    for (const field of depositProtectionRequiredFields) addKnown(field);
  }

  if (revolvingTopicPattern.test(text)) {
    addKnown("revolvingDefinition");
    addKnown("revolvingPaymentStructure");
    if (/할부/iu.test(text)) addKnown("revolvingInstallmentDifference");
    if (/수수료|수수료율|이자/iu.test(text)) addKnown("revolvingFeeRisk");
    if (/설명서|설명의무|설명/iu.test(text)) addKnown("revolvingDisclosureDuty");
    if (/비교|공시|고지|안내/iu.test(text)) addKnown("revolvingFeeDisclosure");
    if (/최소결제비율/iu.test(text)) addKnown("revolvingMinimumPaymentRatio");
    if (/해지|상환|전액결제/iu.test(text)) addKnown("revolvingCancellationGuidance");
  }

  if (continuingTransactionTopicPattern.test(text)) {
    addKnown("continuingTransactionDefinition");
    if (article30DutyPattern.test(text)) {
      addKnown("continuingTransactionArticle30Threshold");
      addKnown("continuingTransactionContractDocument");
    }
    if (excessivePenaltyPattern.test(text)) addKnown("excessiveTerminationPenalty");
    if (improperRefundPattern.test(text)) addKnown("excessPaymentRefund");
  }

  for (const fact of facts) {
    if (topicMarkerFields.has(fact.field)) continue;
    if (fact.field.startsWith("genericClaim:")) add(fact.field, fact.value);
  }

  for (const [field, pattern] of genericPlanningSignals) {
    if (pattern.test(text)) addKnown(field);
  }

  return Object.freeze([...required.values()]);
}

export function evaluateApprovalSourcePreflightCoverage(input: Readonly<{
  profileId: ApprovalPolicyProfileId;
  opportunity: ConfirmedContentOpportunity;
  sources: readonly Readonly<{
    page: ApprovalSourcePage;
    claims?: readonly ApprovalSourcePreflightClaim[];
  }>[];
  requiredClaims?: readonly ApprovalSourcePreflightRequirement[];
}>): ApprovalSourcePreflightCoverageResult {
  const requiredClaims = Object.freeze([
    ...(input.requiredClaims
      ?? requiredApprovalSourcePreflightClaims(input.opportunity, input.profileId)),
  ]);
  const requiredByField = new Map(
    requiredClaims.map((claim) => [claim.field, claim]),
  );
  const covered = new Set<string>();

  const sources = input.sources.map(({ page, claims = [] }) => {
    const hintedClaimFields = unique([
      ...(approvalEvidenceClaimFieldsForSourceUrl(page.requestedUrl) ?? []),
      ...(approvalEvidenceClaimFieldsForSourceUrl(page.finalUrl) ?? []),
    ]);
    const candidatesByField = new Map<string, ApprovalSourcePreflightClaim[]>();

    for (const claim of claims) {
      const field = claim.field.trim();
      const value = claim.value.replace(/\s+/gu, " ").trim();
      const evidenceExcerpt = claim.evidenceExcerpt
        .replace(/\s+/gu, " ")
        .trim();
      if (!requiredByField.has(field)) continue;
      const candidates = candidatesByField.get(field) ?? [];
      candidates.push(Object.freeze({ field, value, evidenceExcerpt }));
      candidatesByField.set(field, candidates);
    }

    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const requirement of requiredClaims) {
      const candidates = candidatesByField.get(requirement.field) ?? [];
      const verified = candidates.some((claim) =>
        claimMatchesRequirement(page, requirement, claim));
      if (verified) {
        accepted.push(requirement.field);
        covered.add(requirement.field);
      } else {
        rejected.push(requirement.field);
      }
    }

    return Object.freeze({
      url: page.finalUrl || page.requestedUrl,
      hintedClaimFields: Object.freeze(hintedClaimFields),
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

export function approvalSourcePreflightClaimMatchesPage(
  page: ApprovalSourcePage,
  requirement: ApprovalSourcePreflightRequirement,
  claim: ApprovalSourcePreflightClaim,
): boolean {
  return claimMatchesRequirement(page, requirement, claim);
}

function claimMatchesRequirement(
  page: ApprovalSourcePage,
  requirement: ApprovalSourcePreflightRequirement,
  claim: ApprovalSourcePreflightClaim,
): boolean {
  if (claim.field !== requirement.field) return false;
  if (!claim.value.trim() || !claim.evidenceExcerpt.trim()) return false;
  if (page.status < 200 || page.status >= 400) return false;
  if (page.extractionStatus !== "extracted") return false;
  if (
    page.documentFormat === "binary"
    || page.documentFormat === "unknown"
  ) {
    return false;
  }

  const pageText = [
    page.title,
    page.publisher,
    page.text,
    page.requestedUrl,
    page.finalUrl,
  ].join("\n");
  if (!evidenceExcerptMatchesPage(claim.evidenceExcerpt, pageText)) {
    return false;
  }
  if (!claimValueMatchesText(claim.value, pageText)) return false;
  if (
    requirement.plannedValue
    && !plannedValueMatchesClaim(requirement.plannedValue, claim.value)
  ) {
    return false;
  }

  const policyMatch = approvalFactMatchesPage(page, Object.freeze({
    field: claim.field,
    value: claim.value,
  }));
  return policyMatch
    || scalarPlanningField(claim.field)
    || canonicalQuantitiesMatch(claim.value, pageText);
}

function evidenceExcerptMatchesPage(excerpt: string, pageText: string): boolean {
  const normalizedExcerpt = normalizeComparable(excerpt);
  if (normalizedExcerpt.length < 2) return false;
  return normalizeComparable(pageText).includes(normalizedExcerpt);
}

function claimValueMatchesText(value: string, text: string): boolean {
  const normalizedValue = normalizeComparable(value);
  const normalizedText = normalizeComparable(text);
  if (normalizedValue.length >= 2 && normalizedText.includes(normalizedValue)) {
    return true;
  }

  if (!canonicalQuantitiesMatch(value, text)) return false;
  const keywords = significantValueTokens(value);
  if (!keywords.length) return true;
  const matched = keywords.filter((token) =>
    normalizedText.includes(normalizeComparable(token)));
  return matched.length >= Math.min(2, keywords.length)
    && matched.length / keywords.length >= 0.5;
}

function plannedValueMatchesClaim(
  plannedValue: string,
  submittedValue: string,
): boolean {
  const planned = normalizeComparable(plannedValue);
  const submitted = normalizeComparable(submittedValue);
  if (
    planned.length >= 2
    && submitted.length >= 2
    && (planned.includes(submitted) || submitted.includes(planned))
  ) {
    return true;
  }

  if (extractCanonicalQuantities(plannedValue).length) {
    return canonicalQuantitiesMatch(plannedValue, submittedValue);
  }

  const plannedTokens = significantValueTokens(plannedValue);
  if (!plannedTokens.length) return false;
  const submittedTokens = new Set(significantValueTokens(submittedValue));
  const matched = plannedTokens.filter((token) => submittedTokens.has(token));
  return matched.length >= Math.min(2, plannedTokens.length)
    && matched.length / plannedTokens.length >= 0.6;
}

function canonicalQuantitiesMatch(expected: string, observed: string): boolean {
  const expectedQuantities = extractCanonicalQuantities(expected);
  if (!expectedQuantities.length) return false;
  const observedQuantities = new Set(extractCanonicalQuantities(observed));
  return expectedQuantities.every((item) => observedQuantities.has(item));
}

function extractCanonicalQuantities(value: string): readonly string[] {
  const normalized = value.normalize("NFKC");
  const found = new Set<string>();
  const addDate = (year: string, month: string, day: string) => {
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (
      monthNumber < 1
      || monthNumber > 12
      || dayNumber < 1
      || dayNumber > 31
    ) {
      return;
    }
    found.add(
      `date:${year}${String(monthNumber).padStart(2, "0")}${String(dayNumber).padStart(2, "0")}`,
    );
  };

  for (const match of normalized.matchAll(
    /(?<!\d)(20\d{2})\s*(?:년|[-./])\s*(0?[1-9]|1[0-2])\s*(?:월|[-./])\s*(0?[1-9]|[12]\d|3[01])\s*일?/gu,
  )) {
    addDate(match[1] ?? "", match[2] ?? "", match[3] ?? "");
  }
  for (const match of normalized.matchAll(
    /(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/gu,
  )) {
    addDate(match[1] ?? "", match[2] ?? "", match[3] ?? "");
  }

  for (const match of normalized.matchAll(
    /(?<![\d.,])(\d+(?:\.\d+)?)\s*(조|억|만|천)\s*원(?![가-힣])/gu,
  )) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    const multiplier = koreanMoneyMultipliers[match[2] ?? ""] ?? 1;
    found.add(`money:${Math.round(amount * multiplier)}:KRW`);
  }

  for (const match of normalized.matchAll(
    /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\s*원(?![가-힣])/gu,
  )) {
    const amount = Number((match[1] ?? "").replaceAll(",", ""));
    if (Number.isFinite(amount)) found.add(`money:${amount}:KRW`);
  }

  for (const match of normalized.matchAll(
    /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:%|퍼센트)/gu,
  )) {
    found.add(`percent:${canonicalNumber(match[1] ?? "")}`);
  }

  const withoutDates = normalized
    .replace(
      /(?<!\d)20\d{2}\s*(?:년|[-./])\s*(?:0?[1-9]|1[0-2])\s*(?:월|[-./])\s*(?:0?[1-9]|[12]\d|3[01])\s*일?/gu,
      " ",
    )
    .replace(
      /(?<!\d)20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)/gu,
      " ",
    );
  for (const match of withoutDates.matchAll(
    /(?<![\d.])(\d+(?:\.\d+)?)\s*(년|개월|일|시간|분)(?![가-힣])/gu,
  )) {
    found.add(
      `duration:${canonicalNumber(match[1] ?? "")}:${match[2] ?? ""}`,
    );
  }

  for (const match of normalized
    .replace(/센티미터|㎝/gu, "cm")
    .replace(/밀리미터/gu, "mm")
    .matchAll(
      /(?<![\d.])(\d+(?:\.\d+)?)\s*(cm|mm|kg|g|m²|㎡|m)(?![A-Za-z가-힣])/giu,
    )) {
    found.add(
      `unit:${canonicalNumber(match[1] ?? "")}:${(match[2] ?? "").toLocaleLowerCase("en-US")}`,
    );
  }

  return Object.freeze([...found]);
}

function canonicalNumber(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

function significantValueTokens(value: string): readonly string[] {
  const found = new Set<string>();
  for (const match of value.normalize("NFKC").matchAll(/[가-힣A-Za-z]{2,}/gu)) {
    const token = match[0].toLocaleLowerCase("ko-KR");
    if (claimStopWords.has(token)) continue;
    found.add(token);
  }
  return Object.freeze([...found].slice(0, 30));
}

function scalarPlanningField(field: string): boolean {
  return scalarPlanningFields.has(field) || field.startsWith("genericClaim:");
}

function planningText(opportunity: ConfirmedContentOpportunity): string {
  return [
    opportunity.sourceRequest,
    opportunity.selectedTopic,
    opportunity.primaryKeyword,
    ...opportunity.secondaryKeywords,
    opportunity.searchIntent,
    opportunity.audience,
    opportunity.contentAngle,
    opportunity.readerProblem,
    ...opportunity.expectedCoverage,
    ...opportunity.qualityTarget.requiredContentElements,
    ...opportunity.qualityTarget.coreQuestions,
    ...opportunity.qualityTarget.decisionCriteria,
    ...opportunity.qualityTarget.warningsOrExceptions,
    ...opportunity.qualityTarget.scopeBoundaries,
  ].join("\n");
}

function normalizeComparable(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/&nbsp;|\u00a0/gu, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))];
}

const artRequiredFields = Object.freeze([
  "artworkTitle",
  "creationYear",
  "medium",
  "dimensions",
  "holdingInstitution",
]);

const retirementRequiredFields = Object.freeze([
  "continuousServicePeriod",
  "averageWage",
  "retirementPayFormula",
  "paymentDeadline",
]);

const depositProtectionRequiredFields = Object.freeze([
  "depositProtectedProducts",
  "depositProtectionLimit",
  "depositProtectionUnit",
  "depositProtectionExclusions",
  "depositProtectionCheckPath",
  "depositProtectionEffectiveDate",
  "depositProtectionStatutoryBasis",
]);

const retirementTopicPattern = /퇴직금|퇴직급여|계속\s*근로|평균\s*임금/iu;
const leaveTreatmentPattern = /휴직|휴업|출산전후휴가|육아휴직/iu;
const interimSettlementPattern = /중간\s*정산/iu;
const statutoryBasisPattern = /법적\s*근거|법령|법률|근로자퇴직급여\s*보장법|근로기준법/iu;
const depositProtectionTopicPattern =
  /예금자\s*보호|예금\s*보호|예금보험|보호\s*한도|보호\s*대상\s*금융상품/iu;
const revolvingTopicPattern =
  /리볼빙|일부결제금액이월약정|약정결제비율|이월잔액/iu;
const continuingTransactionTopicPattern =
  /계속거래[^\n.]{0,260}(?:계약서|설명|위약금|환급|해지)|(?:계약서|위약금|환급)[^\n.]{0,260}계속거래/iu;
const article30DutyPattern =
  /법\s*제?\s*30조|제30조|계약[^\n.]{0,100}설명|계약서[^\n.]{0,100}발급/iu;
const excessivePenaltyPattern =
  /손실[^\n.]{0,100}현저히\s*초과[^\n.]{0,120}위약금/iu;
const improperRefundPattern =
  /실제\s*공급(?:분|된\s*재화등의\s*대가)[^\n.]{0,220}환급/iu;

const genericPlanningSignals: readonly Readonly<[string, RegExp]>[] = Object.freeze([
  ["eligibility", /(?:지원|신청|적용|지급)\s*(?:대상|조건|자격|요건)/iu],
  ["period", /(?:신청|적용|지급)\s*기간/iu],
  ["amount", /지원\s*금액|지급액|지원금|금액|한도/iu],
  ["incomeThreshold", /소득\s*기준|기준\s*중위소득/iu],
  ["interestRate", /금리|이자율/iu],
  ["taxRate", /세율|공제율/iu],
  ["exceptions", /예외|제외|주의사항/iu],
  ["statutoryBasis", /법적\s*근거|관련\s*법령|법률상|법령상/iu],
]);

const topicMarkerFields = new Set([
  "retirementTopic",
  "depositProtectionTopic",
  "revolvingTopic",
]);

const scalarPlanningFields = new Set([
  "artworkTitle",
  "creationYear",
  "medium",
  "dimensions",
  "holdingInstitution",
  "eligibility",
  "period",
  "amount",
  "incomeThreshold",
  "interestRate",
  "taxRate",
  "exceptions",
]);

const koreanMoneyMultipliers: Readonly<Record<string, number>> = Object.freeze({
  천: 1_000,
  만: 10_000,
  억: 100_000_000,
  조: 1_000_000_000_000,
});

const claimStopWords = new Set([
  "그리고",
  "그러나",
  "따라서",
  "대한",
  "관한",
  "에서",
  "으로",
  "하는",
  "있습니다",
  "합니다",
  "됩니다",
  "기준",
  "내용",
  "경우",
]);
