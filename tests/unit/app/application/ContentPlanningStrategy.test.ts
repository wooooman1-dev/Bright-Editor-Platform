import { describe, expect, it, vi } from "vitest";

import { ContentPlanningStrategy, createManualPlanningResult, filterPlanningPlatforms, parsePlanningResult } from "../../../../app/application/ContentPlanningStrategy";

const result = { interpretedIntent: "혈당 관리 글", domain: "health", targetAudience: "50대", contentGoal: "실천 안내", recommendedPrimaryKeyword: "50대 혈당 관리", keywordCandidates: ["50대 혈당 관리", "식후 걷기"], searchIntent: "informational", recommendedContentType: "guide", recommendedPlatforms: ["tistory"], suggestedTitleAngles: ["50대 혈당 관리 가이드"], relatedKeywords: ["식후 혈당"], contentCluster: ["운동", "식단"], recommendationReason: "요청과 독자에 적합", confidence: 0.86, estimateDisclosure: "AI estimate" };

describe("natural-language content planning", () => {
  it("uses exactly one provider request and returns structured recommendations", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify(result), model: "test" }) };
    const plan = await new ContentPlanningStrategy(provider).analyze("50대를 위한 혈당 관리 글을 만들고 싶어");
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(plan.recommendedPrimaryKeyword).toBe("50대 혈당 관리");
    expect(plan.estimateDisclosure).toContain("not measured");
  });
  it("supports a manual fallback without fabricated metrics", () => {
    const plan = createManualPlanningResult("테슬라 실적을 분석하는 블로그 글");
    expect(plan.confidence).toBe(0);
    expect(plan.estimateDisclosure).not.toMatch(/\b\d+\s*(?:searches|CPC)/i);
  });
  it("rejects incomplete provider output", () => expect(() => parsePlanningResult("{}")).toThrow("missing"));
  it("filters AI platform recommendations to the Workspace enabled list", () => {
    const plan = filterPlanningPlatforms({ ...result, recommendedPlatforms: ["tistory", "YouTube", "Naver Cafe"] }, ["tistory", "wordpress"]);
    expect(plan.recommendedPlatforms).toEqual(["tistory"]);
  });
  it("returns complete atomic opportunity candidates in automatic mode", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      ...result,
      opportunityCandidates: [
        { selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법", secondaryKeywords: ["유산균", "식이섬유"], searchIntent: "장 건강 개선 방법 탐색", audience: "일반 성인", contentType: "guide", contentAngle: "음식과 생활습관", readerProblem: "관리 기준 부족", expectedCoverage: ["장내 환경", "유산균"], selectionRationale: "콘텐츠 공백 추론", opportunityEvidence: [{ source: "inferred", summary: "기존 글과 중복이 적음" }], confidence: 0.8, cautions: ["검색량 실측값 없음"] },
        { selectedTopic: "만성 염증 관리", primaryKeyword: "만성 염증 관리 방법", secondaryKeywords: ["CRP", "항염 식단"], searchIntent: "만성 염증 관리 탐색", audience: "일반 성인", contentType: "guide", contentAngle: "검사와 생활습관", readerProblem: "염증 관리 기준 부족", expectedCoverage: ["CRP", "항염 식단"], selectionRationale: "콘텐츠 클러스터 확장", opportunityEvidence: [{ source: "estimated", summary: "AI가 기회를 추정" }], confidence: 0.7, cautions: ["검색량 실측값 없음"] },
      ],
    }), model: "test" }) };
    const plan = await new ContentPlanningStrategy(provider).analyze("아직 작성하지 않은 건강 주제를 골라줘", ["tistory"], { projectId: "project-1", selectionMode: "automatic" });
    expect(plan.opportunityCandidates).toHaveLength(2);
    expect(plan.opportunityCandidates?.[1]).toMatchObject({ selectedTopic: "만성 염증 관리", primaryKeyword: "만성 염증 관리 방법", searchIntent: "만성 염증 관리 탐색", secondaryKeywords: ["CRP", "항염 식단"] });
    expect(plan.selectionMode).toBe("automatic");
    expect(provider.generate).toHaveBeenCalledOnce();
  });
  it("does not expose fabricated search-volume claims as verified data", () => {
    const plan = parsePlanningResult(JSON.stringify({ ...result, recommendationReason: "월간 12,000회 검색되고 검색량이 높다", opportunityCandidates: [{ selectedTopic: "혈당 관리", primaryKeyword: "혈당 관리 방법", secondaryKeywords: [], searchIntent: "혈당 관리 방법 탐색", audience: "성인", contentType: "guide", contentAngle: "실천 안내", readerProblem: "관리 기준 부족", expectedCoverage: [], selectionRationale: "검색 데이터 기반이며 경쟁도가 낮다", opportunityEvidence: [{ source: "verified", summary: "많이 검색됩니다" }], confidence: 0.7, cautions: [] }] }), { projectId: "project-1", selectionMode: "automatic", hasVerifiedKeywordData: false, sourceRequest: "혈당 주제를 골라줘" });
    expect(plan.recommendationReason).not.toContain("12,000");
    expect(plan.opportunityCandidates?.[0].opportunityEvidence[0].source).toBe("estimated");
    expect(plan.opportunityCandidates?.[0].selectionRationale).toContain("AI 분석 기반");
    expect(plan.opportunityCandidates?.[0].selectionRationale).not.toContain("경쟁도가 낮다");
  });
  it("ignores AI-supplied binding, identity, classification, Evidence IDs, and fingerprint", () => {
    const plan = parsePlanningResult(JSON.stringify({
      ...result,
      opportunityCandidates: [{
        selectedTopic: "혈당 관리", primaryKeyword: "혈당 관리 방법", secondaryKeywords: [" 식후 걷기 ", "식후 걷기"],
        searchIntent: "혈당 관리 방법 탐색", audience: "성인", contentType: "guide", contentAngle: "실천 안내",
        readerProblem: "관리 기준 부족", expectedCoverage: ["식단"], selectionRationale: "콘텐츠 공백",
        opportunityEvidence: [{ source: "inferred", summary: "내부 추론" }], confidence: 0.7, cautions: [],
        workspaceId: "workspace-forged", projectId: "project-forged", contentId: "content-forged",
        opportunityId: "opportunity-forged", recommendationType: "comprehensive", evidenceIds: ["evidence-forged"], fingerprint: "fp-forged",
      }],
    }), { projectId: "project-server", selectionMode: "automatic", sourceRequest: "혈당 주제를 골라줘" });
    expect(plan.opportunityCandidates?.[0]).toMatchObject({ projectId: "project-server", secondaryKeywords: ["식후 걷기"] });
    expect(plan.opportunityCandidates?.[0]).not.toMatchObject({ opportunityId: "opportunity-forged", fingerprint: "fp-forged", recommendationType: "comprehensive", evidenceIds: ["evidence-forged"] });
  });
  it("rejects an adjacent opportunity that replaces a user-specified topic", () => {
    const mixed = { ...result, opportunityCandidates: [{ selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법", secondaryKeywords: ["유산균"], searchIntent: "장 건강 개선 탐색", audience: "성인", contentType: "guide", contentAngle: "장 건강 실천", readerProblem: "장 건강 기준 부족", expectedCoverage: ["유산균"], selectionRationale: "AI 추정", opportunityEvidence: [{ source: "estimated", summary: "AI 추정" }], confidence: 0.7, cautions: [] }] };
    expect(() => parsePlanningResult(JSON.stringify(mixed), { projectId: "project-1", selectionMode: "userSpecified", sourceRequest: "만성 염증 관리 글을 작성해 줘" }))
      .toThrow("complete Content Opportunity");
  });
});
