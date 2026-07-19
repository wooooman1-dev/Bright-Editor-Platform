import { describe, expect, it } from "vitest";
import { assessOpportunityRecommendation, createOpportunityEvidence, hasCurrentEvidenceFingerprint } from "../../../../core/intelligence";

const evidence = (overrides: Partial<Parameters<typeof createOpportunityEvidence>[0]> = {}) => createOpportunityEvidence({
  workspaceId: "workspace-1", projectId: "project-1", provider: "brightStudio", evidenceType: "contentGap",
  topic: "장 건강", observedAt: "2026-07-18T00:00:00.000Z", syncedAt: "2026-07-18T00:00:00.000Z",
  freshness: "fresh", verified: true, value: 1, unit: "gap", confidence: 0.8,
  limitations: ["Content gap is not search demand."], sourceReference: "project:1", resourceScope: "project", ...overrides,
});
const gates = { duplicate: false, projectAligned: true, searchIntentClear: true, safetyPassed: true };

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
});
