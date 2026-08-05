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
  const factualValues = explicitPlanningFactValues(opportunity, profileId);
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
  const addKnown = (field: string) => add(field, factualValues.get(field));

  if (profileId === "tistory_vivarain_art_v1") {
    artRequiredFields.forEach(addKnown);
    return Object.freeze([...required.values()]);
  }

  if (retirementTopicPattern.test(text)) {
    retirementRequiredFields.forEach(addKnown);
    if (leaveTreatmentPattern.test(text)) addKnown("leaveTreatment");
    if (interimSettlementPattern.test(text)) addKnown("interimSettlement");
    if (statutoryBasisPattern.test(text)) addKnown("statutoryBasis");
  }

  if (depositProtectionTopicPattern.test(text)) {
    depositProtectionRequiredFields.forEach(addKnown);
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
    if (
      !topicMarkerFields.has(fact.field)
      && fact.field.startsWith("genericClaim:")
    ) {
      add(fact.field, fact.value);
    }
  }

  for (const [field, pattern] of genericPlanningSignals) {
    if (pattern.test(text)) addKnown(field);
  }

  return Object.freeze([...required.values()]);
}

export function hasConcreteApprovalSourcePreflightPlannedValue(
  opportunity: ConfirmedContentOpportunity,
  requirement: ApprovalSourcePreflightRequirement,
): boolean {
  const plannedValue = requirement.plannedValue?.replace(/\s+/gu, " ").trim();
  if (!plannedValue) return false;
  const validator = genericScalarPlannedValueValidators.get(requirement.field);
  if (!validator || !validator(plannedValue)) return false;

  if (!genericScalarFieldsRequiringExplicitLabel.has(requirement.field)) {
    return true;
  }

  const fieldLabel = genericPlanningSignalByField.get(requirement.field);
  if (!fieldLabel) return false;
  const normalizedPlannedValue = normalizeComparable(plannedValue);
  if (normalizedPlannedValue.length < 2) return false;

  return explicitPlanningLines(opportunity).some((line) => {
    const separatorIndex = line.search(/[:：]/u);
    if (separatorIndex < 1) return false;
    const label = line.slice(0, separatorIndex).trim();
    const value = normalizeComparable(line.slice(separatorIndex + 1));
    return fieldLabel.test(label)
      && value.length >= 2
      && (
        value.includes(normalizedPlannedValue)
        || normalizedPlannedValue.includes(value)
      );
  });
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
      const normalized = normalizeSubmittedClaim(claim);
      if (!requiredByField.has(normalized.field)) continue;
      const candidates = candidatesByField.get(normalized.field) ?? [];
      candidates.push(normalized);
      candidatesByField.set(normalized.field, candidates);
    }

    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const requirement of requiredClaims) {
      const matches = (candidatesByField.get(requirement.field) ?? [])
        .some((claim) => claimMatchesRequirement(page, requirement, claim));
      if (matches) {
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

  return Object.freeze({
    status: requiredClaims.length === 0
      ? "not_required"
      : uncoveredClaimFields.length === 0
        ? "covered"
        : "incomplete",
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
  if (!claim.value || !claim.evidenceExcerpt) return false;
  if (page.status < 200 || page.status >= 400) return false;
  if (page.extractionStatus !== "extracted") return false;
  if (page.documentFormat === "binary" || page.documentFormat === "unknown") {
    return false;
  }

  const pageText = [
    page.title,
    page.publisher,
    page.text,
    page.requestedUrl,
    page.finalUrl,
  ].join("\n");
  if (!containsNormalized(pageText, claim.evidenceExcerpt)) return false;
  if (!claimValueMatchesText(claim.value, pageText)) return false;
  if (
    requirement.plannedValue
    && !plannedValueMatchesClaim(requirement.plannedValue, claim.value)
  ) {
    return false;
  }

  return approvalFactMatchesPage(page, Object.freeze({
    field: claim.field,
    value: claim.value,
  }))
    || scalarPlanningField(claim.field)
    || canonicalQuantitiesMatch(claim.value, pageText);
}

function normalizeSubmittedClaim(
  claim: ApprovalSourcePreflightClaim,
): ApprovalSourcePreflightClaim {
  return Object.freeze({
    field: claim.field.trim(),
    value: claim.value.replace(/\s+/gu, " ").trim(),
    evidenceExcerpt: claim.evidenceExcerpt.replace(/\s+/gu, " ").trim(),
  });
}

function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeComparable(needle);
  return normalizedNeedle.length >= 2
    && normalizeComparable(haystack).includes(normalizedNeedle);
}

function claimValueMatchesText(value: string, text: string): boolean {
  if (containsNormalized(text, value)) return true;
  if (!canonicalQuantitiesMatch(value, text)) return false;

  const keywords = significantNonQuantityTokens(value);
  if (!keywords.length) return true;
  const normalizedText = normalizeComparable(text);
  const matched = keywords.filter((token) =>
    normalizedText.includes(normalizeComparable(token)));
  return matched.length >= 1 && matched.length / keywords.length >= 0.5;
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
  return expectedQuantities.every((quantity) => observedQuantities.has(quantity));
}

function explicitPlanningFactValues(
  opportunity: ConfirmedContentOpportunity,
  profileId: ApprovalPolicyProfileId,
): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const line of explicitPlanningLines(opportunity)) {
    for (const fact of extractProfileApprovalFactsFromText(line, profileId)) {
      if (!concretePlanningFact(line, fact.field, fact.value)) continue;
      if (!found.has(fact.field)) found.set(fact.field, fact.value);
    }
    for (const [field, pattern] of genericPlanningSignals) {
      if (found.has(field)) continue;
      const match = line.match(pattern);
      if (!match || match.index === undefined) continue;
      const value = line.slice(match.index + match[0].length)
        .replace(/^[\s:：·-]+/u, "")
        .trim();
      if (!concretePlanningFact(line, field, value)) continue;
      found.set(field, value);
    }
  }
  return found;
}

function explicitPlanningLines(
  opportunity: ConfirmedContentOpportunity,
): readonly string[] {
  return Object.freeze([
    ...opportunity.expectedCoverage,
    ...opportunity.cautions,
    ...qualityTargetLines(opportunity).filter(looksLikeFactualPlanningLine),
  ].map((line) => line.replace(/\s+/gu, " ").trim()).filter(Boolean));
}

function concretePlanningFact(
  line: string,
  field: string,
  value: string,
): boolean {
  if (/[:：]/u.test(line)) return true;
  if (extractCanonicalQuantities(value).length) return true;
  if (artRequiredFields.includes(field)) return true;
  return /(?:법|시행령|시행규칙|제\s*\d+조|의무|금지|제한|환급|위약금)/u.test(line)
    && value.replace(/\s+/gu, " ").trim().length >= 16;
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
    /(?<![\d.,])(\d+(?:\.\d+)?)\s*(조|억|만|천)\s*원/gu,
  )) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    const multiplier = koreanMoneyMultipliers[match[2] ?? ""];
    if (multiplier) {
      found.add(`money:${Math.round(amount * multiplier)}:KRW`);
    }
  }
  for (const match of normalized.matchAll(
    /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\s*원/gu,
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
    /(?<![\d.])(\d+(?:\.\d+)?)\s*(년|개월|일|시간|분)/gu,
  )) {
    found.add(
      `duration:${canonicalNumber(match[1] ?? "")}:${match[2] ?? ""}`,
    );
  }

  for (const match of normalized
    .replace(/센티미터|㎝/gu, "cm")
    .replace(/밀리미터/gu, "mm")
    .matchAll(
      /(?<![\d.])(\d+(?:\.\d+)?)\s*(cm|mm|kg|g|m²|㎡|m)(?![A-Za-z])/giu,
    )) {
    found.add(
      `unit:${canonicalNumber(match[1] ?? "")}:${(match[2] ?? "").toLocaleLowerCase("en-US")}`,
    );
  }

  return Object.freeze([...found]);
}

function significantNonQuantityTokens(value: string): readonly string[] {
  const withoutQuantities = value.normalize("NFKC")
    .replace(
      /(?<!\d)20\d{2}\s*(?:년|[-./])\s*(?:0?[1-9]|1[0-2])\s*(?:월|[-./])\s*(?:0?[1-9]|[12]\d|3[01])\s*일?/gu,
      " ",
    )
    .replace(/(?<!\d)20\d{6}(?!\d)/gu, " ")
    .replace(/(?<![\d.,])\d+(?:\.\d+)?\s*(?:조|억|만|천)\s*원/gu, " ")
    .replace(/(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)\s*원/gu, " ")
    .replace(/(?<![\d.])\d+(?:\.\d+)?\s*(?:%|퍼센트)/gu, " ")
    .replace(/(?<![\d.])\d+(?:\.\d+)?\s*(?:년|개월|일|시간|분)/gu, " ")
    .replace(/(?<![\d.])\d+(?:\.\d+)?\s*(?:cm|mm|kg|g|m²|㎡|m)(?![A-Za-z])/giu, " ");
  return significantValueTokens(withoutQuantities);
}

function canonicalNumber(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

function significantValueTokens(value: string): readonly string[] {
  const found = new Set<string>();
  for (const match of value.normalize("NFKC").matchAll(/[가-힣A-Za-z]{2,}/gu)) {
    const token = match[0].toLocaleLowerCase("ko-KR");
    if (!claimStopWords.has(token)) found.add(token);
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
    ...opportunity.cautions,
    ...qualityTargetLines(opportunity).filter(looksLikeFactualPlanningLine),
  ].join("\n");
}

function qualityTargetLines(
  opportunity: ConfirmedContentOpportunity,
): readonly string[] {
  return Object.freeze([
    ...opportunity.qualityTarget.requiredContentElements,
    ...opportunity.qualityTarget.coreQuestions,
    ...opportunity.qualityTarget.decisionCriteria,
    ...opportunity.qualityTarget.warningsOrExceptions,
    ...opportunity.qualityTarget.scopeBoundaries,
  ]);
}

function looksLikeFactualPlanningLine(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || genericQualityBoilerplate.has(normalized)) return false;
  return /[:：]|(?:\d|%|퍼센트|원|금리|세율|기간|대상|자격|요건|한도|지원금|법|시행령|시행규칙|제\s*\d+조|의무|금지|제한|환급|위약금|작품명|제작\s*연도|재료|기법|크기|규격|소장처|기관)/u.test(normalized);
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
const genericPlanningSignalByField = new Map(genericPlanningSignals);
const editorialCountPattern = /\d+(?:[.,]\d+)?\s*(?:가지|단계|방법|순서|항목|체크포인트|팁)/u;
const genericScalarFieldsRequiringExplicitLabel = new Set([
  "eligibility",
  "exceptions",
  "statutoryBasis",
]);
const genericScalarPlannedValueValidators: ReadonlyMap<string, (value: string) => boolean> = new Map([
  ["amount", (value) => hasMoneyOrPercentQuantity(value)],
  ["incomeThreshold", (value) => hasMoneyOrPercentQuantity(value)],
  ["interestRate", (value) => hasPercentQuantity(value)],
  ["taxRate", (value) => hasPercentQuantity(value)],
  ["period", (value) => hasPeriodQuantity(value)],
  ["eligibility", (value) => hasEligibilityCondition(value)],
  ["exceptions", (value) => hasExceptionCondition(value)],
  ["statutoryBasis", (value) => hasStatutoryBasis(value)],
]);

function hasMoneyOrPercentQuantity(value: string): boolean {
  return extractCanonicalQuantities(value).some((quantity) =>
    quantity.startsWith("money:") || quantity.startsWith("percent:"));
}

function hasPercentQuantity(value: string): boolean {
  return extractCanonicalQuantities(value)
    .some((quantity) => quantity.startsWith("percent:"));
}

function hasPeriodQuantity(value: string): boolean {
  return extractCanonicalQuantities(value).some((quantity) => {
    if (quantity.startsWith("date:")) return true;
    if (!quantity.startsWith("duration:")) return false;
    return !/^duration:20\d{2}:년$/u.test(quantity);
  });
}

function hasEligibilityCondition(value: string): boolean {
  return hasDescriptivePlanningValue(value)
    && /(?:대상|세대주|무주택|이상|이하|미만|초과|불가|가능|보유|체류|신청|적용|자격|요건)/u.test(value);
}

function hasExceptionCondition(value: string): boolean {
  return hasDescriptivePlanningValue(value)
    && !/(?:일반화하면\s*안\s*되|주의사항)/u.test(value);
}

function hasStatutoryBasis(value: string): boolean {
  return hasDescriptivePlanningValue(value)
    && /(?:[가-힣A-Za-z]{2,}(?:법|시행령|시행규칙|법률|조례|규정)|(?:법|시행령|시행규칙)\s*제?\s*\d+조)/u.test(value);
}

function hasDescriptivePlanningValue(value: string): boolean {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length < 2 || editorialCountPattern.test(normalized)) return false;
  return !/(?:^(?:확인|비교|주의사항|예외|제외|대상)(?:\s*(?:필요|확인))?$|확인\s*(?:필요|하세요|해야|방법|순서)|(?:대상|적용)\s*여부\s*확인|확인\s*경로|비교\s*(?:방법|기준)?|판단할\s*기준|결정할\s*기준|독자가[^.]{0,40}(?:결정|판단))/iu.test(normalized);
}

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
const genericQualityBoilerplate = new Set([
  "독자의 질문에 대한 직접 답변",
  "필요한 배경 설명",
  "실행 또는 적용 방법",
  "주의사항과 다음 행동",
  "복잡한 원인과 관계",
  "여러 판단 기준",
  "구체적인 사례와 예외",
  "오해하기 쉬운 부분",
  "위험과 주의사항",
  "실행 가능한 다음 행동",
  "명확한 비교 기준",
  "차이와 장단점",
  "상황별 선택 조건",
  "최종 판단과 추천 기준",
  "일반화하면 안 되는 예외와 주의사항",
  "확인되지 않은 수치·사실·URL을 만들지 않음",
  "주제 밖의 일반론으로 범위를 확장하지 않음",
  "독자가 상황을 구분하고 다음 행동을 선택할 판단 기준",
  "독자가 적용 여부를 결정할 핵심 기준",
]);
