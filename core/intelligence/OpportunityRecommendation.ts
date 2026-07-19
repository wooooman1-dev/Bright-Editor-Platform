import type { EvidenceFreshness, OpportunityEvidenceRecord } from "./Evidence";

export type OpportunityRecommendationType = "comprehensive" | "marketOpportunity" | "blogGrowth";
export type OpportunityEvidenceStatus = "verified" | "limited" | "unavailable";

const externalTypes = new Set(["searchPerformance", "searchDemand", "relativeTrend", "risingTrend", "keywordCompetition", "commercialIntent", "pageEngagement", "revenuePerformance"]);
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

function combinedFreshness(values: readonly EvidenceFreshness[]): EvidenceFreshness {
  if (values.includes("fresh")) return "fresh";
  if (values.includes("aging")) return "aging";
  if (values.includes("stale")) return "stale";
  return "unavailable";
}
