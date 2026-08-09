import type { EvidenceFreshness, OpportunityEvidenceRecord } from "./Evidence";

export type OpportunityRecommendationType = "comprehensive" | "marketOpportunity" | "blogGrowth";
export type OpportunityEvidenceStatus = "verified" | "limited" | "unavailable";
export type OpportunityEditorialValueLevel = "strong" | "adequate" | "weak";

export type OpportunityEditorialValueAssessment = Readonly<{
  eligible: boolean;
  helpfulness: OpportunityEditorialValueLevel;
  factualDefensibility: OpportunityEditorialValueLevel;
  searchIntentResolution: OpportunityEditorialValueLevel;
  differentiation: OpportunityEditorialValueLevel;
  limitations: readonly string[];
}>;

export type OpportunityEditorialValueInput = Readonly<{
  selectedTopic: string;
  primaryKeyword: string;
  searchIntent: string;
  readerProblem: string;
  contentAngle: string;
  selectionRationale: string;
  expectedCoverage: readonly string[];
  coreQuestions: readonly string[];
  decisionCriteria: readonly string[];
  warningsOrExceptions: readonly string[];
  actionableNextSteps: readonly string[];
  scopeBoundaries: readonly string[];
  verificationClaimCount: number;
  duplicate: boolean;
  projectAligned: boolean;
  projectExcluded: boolean;
}>;

const externalTypes = new Set(["searchPerformance", "searchDemand", "relativeTrend", "risingTrend", "keywordCompetition", "commercialIntent", "pageEngagement", "revenuePerformance", "videoPerformance"]);
const internalTypes = new Set(["contentGap", "internalLinkOpportunity", "clusterOpportunity"]);

export type RecommendationAssessment = Readonly<{
  recommendationType?: OpportunityRecommendationType;
  marketEvidenceStatus: OpportunityEvidenceStatus;
  internalGrowthEvidenceStatus: OpportunityEvidenceStatus;
  freshness: EvidenceFreshness;
  limitations: readonly string[];
}>;

export function assessOpportunityRecommendation(input: Readonly<{
  evidence: readonly OpportunityEvidenceRecord[];
  duplicate: boolean;
  projectAligned: boolean;
  searchIntentClear: boolean;
  safetyPassed: boolean;
}>): RecommendationAssessment {
  const eligible = input.evidence.filter((value) => value.verified && value.freshness !== "unavailable");
  const external = eligible.filter((value) => externalTypes.has(value.evidenceType) && value.evidenceType !== "editorialInference");
  const internal = eligible.filter((value) => internalTypes.has(value.evidenceType));
  const strongInternal = internal.filter((value) => value.evidenceType === "internalLinkOpportunity" || value.evidenceType === "clusterOpportunity" || value.confidence >= 0.8);
  const currentExternal = external.filter((value) => value.freshness === "fresh" || value.freshness === "aging");
  const gate = !input.duplicate && input.projectAligned && input.searchIntentClear && input.safetyPassed;
  const recommendationType = gate
    ? currentExternal.length && strongInternal.length ? "comprehensive" as const
      : external.length ? "marketOpportunity" as const
        : internal.length ? "blogGrowth" as const
          : undefined
    : undefined;
  const freshness = combinedFreshness(eligible.map((value) => value.freshness));
  const limitations = [...new Set(input.evidence.flatMap((value) => value.limitations))];
  if (!external.length) limitations.push("외부 시장 데이터가 확인되지 않았습니다. 검색 수요는 검증되지 않았습니다.");
  if (external.length && !currentExternal.length) limitations.push("외부 Evidence가 stale 상태여서 강한 종합 추천 근거로 사용하지 않았습니다.");
  return Object.freeze({
    ...(recommendationType ? { recommendationType } : {}),
    marketEvidenceStatus: external.length ? currentExternal.length ? "verified" : "limited" : "unavailable",
    internalGrowthEvidenceStatus: internal.length ? "verified" : "unavailable",
    freshness,
    limitations: Object.freeze([...new Set(limitations)]),
  });
}

export function recommendationTypePriority(value: OpportunityRecommendationType): number {
  return value === "comprehensive" ? 0 : value === "marketOpportunity" ? 1 : 2;
}

/**
 * Evaluates editorial usefulness before market opportunity. This is deliberately
 * structural and deterministic: it consumes the existing Planning contract and
 * never estimates traffic, competition, or a synthetic overall score.
 */
export function assessOpportunityEditorialValue(input: OpportunityEditorialValueInput): OpportunityEditorialValueAssessment {
  const problem = normalizeEditorialText(input.readerProblem);
  const intent = normalizeEditorialText(input.searchIntent);
  const subject = normalizeEditorialText([
    input.selectedTopic,
    input.primaryKeyword,
    input.contentAngle,
    input.selectionRationale,
  ].join(" "));
  const complete = `${problem} ${intent} ${subject}`;
  const actionOrDecision = /(?:확인|해결|비교|계산|신청|설정|선택|판단|절차|방법|체크|점검|대응|준비|구분|취소|환불|수수료|서류|how to|resolve|check|compare|calculate|apply|configure|choose|decision|steps|troubleshoot)/iu;
  const concreteObstacle = /(?:못|어렵|혼란|문제|부족|달라|차이|오류|누락|필요|모르|unknown|confus|problem|missing|difference|error|need)/iu;
  const seoOnly = /(?:검색량|경쟁도|희소|키워드 기회|검색 기회|search volume|keyword opportunity|low competition|rare keyword|seo opportunity)/iu;
  const genericIntent = /^(?:정보|정보 탐색|알아보기|informational|information|탐색)$/iu;
  const unsupportedCertainty = /(?:100\s*%|무조건|완치|수익\s*보장|승인\s*보장|반드시\s+[^.]{0,20}(?:성공|승인|지급|가능)|guaranteed|always succeeds|certain profit)/iu;
  const conditionalFact = /(?:금액|날짜|법률|세율|자격|금리|공식\s*조건|지원금|수익률|amount|date|legal|tax rate|eligibility|interest rate|official condition)/iu;

  const hasUsefulStructure = input.expectedCoverage.length >= 2
    || input.decisionCriteria.length >= 2
    || input.actionableNextSteps.length >= 2;
  const helpfulSignal = actionOrDecision.test(complete);
  const problemSignal = concreteObstacle.test(problem);
  const helpfulness: OpportunityEditorialValueLevel = seoOnly.test(complete) && !helpfulSignal && !problemSignal
    ? "weak"
    : helpfulSignal && (problemSignal || hasUsefulStructure) ? "strong" : "adequate";

  const factualDefensibility: OpportunityEditorialValueLevel = input.projectExcluded || unsupportedCertainty.test(subject)
    ? "weak"
    : conditionalFact.test(subject) && input.verificationClaimCount === 0 ? "adequate" : "strong";

  const searchIntentResolution: OpportunityEditorialValueLevel = genericIntent.test(intent) || (seoOnly.test(intent) && !actionOrDecision.test(intent))
    ? "weak"
    : actionOrDecision.test(intent) || (intent.length >= 8 && problemSignal) ? "strong" : "adequate";

  const differentiation: OpportunityEditorialValueLevel = input.duplicate
    ? "weak"
    : hasUsefulStructure || (input.expectedCoverage.length > 0 && actionOrDecision.test(subject)) ? "strong" : "adequate";

  const limitations: string[] = [];
  if (helpfulness === "weak") limitations.push("The candidate does not establish a concrete reader problem beyond SEO opportunity.");
  if (factualDefensibility === "weak") limitations.push(input.projectExcluded
    ? "The candidate conflicts with the Project's excluded-topic strategy."
    : "The candidate depends on an unsupported certainty or guarantee.");
  if (searchIntentResolution === "weak") limitations.push("The candidate does not define a concrete search task or question.");
  if (differentiation === "weak") limitations.push("The candidate duplicates existing public content without additional value.");
  if (!input.projectAligned) limitations.push("The candidate is not aligned with the current Project strategy.");

  return Object.freeze({
    eligible: input.projectAligned
      && helpfulness !== "weak"
      && factualDefensibility !== "weak"
      && searchIntentResolution !== "weak"
      && differentiation !== "weak",
    helpfulness,
    factualDefensibility,
    searchIntentResolution,
    differentiation,
    limitations: Object.freeze(limitations),
  });
}

/** Lexicographic comparison in the product priority order; lower sorts first. */
export function compareOpportunityEditorialValue(
  left: OpportunityEditorialValueAssessment,
  right: OpportunityEditorialValueAssessment,
): number {
  return editorialLevelPriority(left.helpfulness) - editorialLevelPriority(right.helpfulness)
    || editorialLevelPriority(left.factualDefensibility) - editorialLevelPriority(right.factualDefensibility)
    || editorialLevelPriority(left.searchIntentResolution) - editorialLevelPriority(right.searchIntentResolution)
    || editorialLevelPriority(left.differentiation) - editorialLevelPriority(right.differentiation);
}

function combinedFreshness(values: readonly EvidenceFreshness[]): EvidenceFreshness {
  if (values.includes("fresh")) return "fresh";
  if (values.includes("aging")) return "aging";
  if (values.includes("stale")) return "stale";
  return "unavailable";
}

function editorialLevelPriority(value: OpportunityEditorialValueLevel): number {
  return value === "strong" ? 0 : value === "adequate" ? 1 : 2;
}

function normalizeEditorialText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ").trim();
}
