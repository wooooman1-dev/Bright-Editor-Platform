import { describe, expect, it } from "vitest";
import { assessOpportunityEditorialValue, assessOpportunityRecommendation, compareOpportunityEditorialValue, createOpportunityEvidence, hasCurrentEvidenceFingerprint } from "../../../../core/intelligence";

const evidence = (overrides: Partial<Parameters<typeof createOpportunityEvidence>[0]> = {}) => createOpportunityEvidence({
  workspaceId: "workspace-1", projectId: "project-1", provider: "brightStudio", evidenceType: "contentGap",
  topic: "장 건강", observedAt: "2026-07-18T00:00:00.000Z", syncedAt: "2026-07-18T00:00:00.000Z",
  freshness: "fresh", verified: true, value: 1, unit: "gap", confidence: 0.8,
  limitations: ["Content gap is not search demand."], sourceReference: "project:1", resourceScope: "project", ...overrides,
});
const gates = { duplicate: false, projectAligned: true, searchIntentClear: true, safetyPassed: true };
const editorial = (overrides: Partial<Parameters<typeof assessOpportunityEditorialValue>[0]> = {}) => assessOpportunityEditorialValue({
  selectedTopic: "카드 취소 금액 확인 방법",
  primaryKeyword: "카드 취소 금액 확인",
  searchIntent: "취소한 결제가 이번 명세서에 반영됐는지 확인하는 방법",
  readerProblem: "취소 후 결제 예정금액이 달라져 확인 순서를 모르겠음",
  contentAngle: "승인 내역과 취소 내역을 구분해 점검하는 절차",
  selectionRationale: "독자가 실제 결제 문제를 해결할 수 있음",
  expectedCoverage: ["승인 내역", "취소 내역", "문의 전 확인사항"],
  coreQuestions: ["어디에서 취소 상태를 확인하는가"],
  decisionCriteria: ["승인과 취소 상태 구분", "문의가 필요한 상태"],
  warningsOrExceptions: ["카드사와 처리 상태에 따라 표시가 다를 수 있음"],
  actionableNextSteps: ["명세서 확인", "거래 내역 대조"],
  scopeBoundaries: ["특정 카드사의 처리 시점은 단정하지 않음"],
  verificationClaimCount: 1,
  duplicate: false,
  projectAligned: true,
  projectExcluded: false,
  ...overrides,
});

describe("Opportunity Intelligence semantics", () => {
  it("keeps deterministic Evidence identity and source references", () => {
    const value = evidence();
    expect(hasCurrentEvidenceFingerprint(value)).toBe(true);
    expect(evidence()).toEqual(value);
    expect(value.sourceReference).toBe("project:1");
  });

  it("classifies external plus internal Evidence as comprehensive", () => {
    const external = evidence({ provider: "googleSearchConsole", projectId: null, evidenceType: "searchPerformance", metric: "clicks", unit: "clicks", sourceReference: "snapshot:1" });
    expect(assessOpportunityRecommendation({ evidence: [external, evidence()], ...gates }).recommendationType).toBe("comprehensive");
  });

  it("classifies external-only as market and internal-only as blog growth", () => {
    const external = evidence({ provider: "naverSearchTrend", projectId: null, evidenceType: "relativeTrend", unit: "relativeRatio", sourceReference: "snapshot:1" });
    expect(assessOpportunityRecommendation({ evidence: [external], ...gates }).recommendationType).toBe("marketOpportunity");
    expect(assessOpportunityRecommendation({ evidence: [evidence()], ...gates }).recommendationType).toBe("blogGrowth");
  });

  it("never turns editorial inference into market Evidence", () => {
    const inference = evidence({ evidenceType: "editorialInference", verified: false, limitations: ["AI inference only"] });
    expect(assessOpportunityRecommendation({ evidence: [inference], ...gates }).recommendationType).toBeUndefined();
  });

  it("does not create a strong comprehensive recommendation from stale external Evidence", () => {
    const external = evidence({ provider: "googleSearchConsole", projectId: null, evidenceType: "searchPerformance", freshness: "stale", metric: "impressions", unit: "siteImpressions" });
    const result = assessOpportunityRecommendation({ evidence: [external, evidence()], ...gates });
    expect(result.recommendationType).not.toBe("comprehensive");
    expect(result.limitations.join(" ")).toContain("stale");
  });

  it("rejects relative trend represented as absolute search volume", () => {
    expect(() => evidence({ provider: "naverSearchTrend", projectId: null, evidenceType: "relativeTrend", unit: "monthlySearchVolume" })).toThrow("absolute search volume");
  });

  it("rejects GA4 engagement as demand and non-page AdSense attribution", () => {
    expect(() => evidence({ provider: "googleAnalytics4", projectId: null, evidenceType: "searchDemand" })).toThrow("GA4");
    expect(() => evidence({ provider: "googleAdSense", projectId: null, evidenceType: "revenuePerformance", pageUrl: "https://example.com/post", resourceScope: "account" })).toThrow("page-level");
  });

  it("requires Google Ads competition to disclose that it is advertising, not SEO difficulty", () => {
    expect(() => evidence({ provider: "googleAdsKeywordPlanning", projectId: null, evidenceType: "keywordCompetition", limitations: ["competition"] })).toThrow("not SEO difficulty");
  });

  it("places concrete reader help ahead of an SEO-only rare-keyword opportunity", () => {
    const useful = editorial();
    const rareOnly = editorial({
      selectedTopic: "희소 키워드 금융 잡학",
      primaryKeyword: "희소 금융 키워드",
      searchIntent: "낮은 경쟁도 키워드 탐색",
      readerProblem: "검색량과 희소성 기회",
      contentAngle: "SEO 기회",
      selectionRationale: "경쟁도가 낮고 희소함",
      expectedCoverage: [],
      decisionCriteria: [],
      actionableNextSteps: [],
    });

    expect(useful.eligible).toBe(true);
    expect(rareOnly).toMatchObject({ eligible: false, helpfulness: "weak", searchIntentResolution: "weak" });
    expect(compareOpportunityEditorialValue(useful, rareOnly)).toBeLessThan(0);
  });

  it("rejects excluded or unsupported certainty topics and keeps conditional facts defensible through verification", () => {
    expect(editorial({ projectExcluded: true })).toMatchObject({ eligible: false, factualDefensibility: "weak" });
    expect(editorial({ contentAngle: "대출 승인을 100% 보장" })).toMatchObject({ eligible: false, factualDefensibility: "weak" });
    expect(editorial({ contentAngle: "지원금 자격 조건 확인", verificationClaimCount: 1 })).toMatchObject({ eligible: true, factualDefensibility: "strong" });
  });
});
