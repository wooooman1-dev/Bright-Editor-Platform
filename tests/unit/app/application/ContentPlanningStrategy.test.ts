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
});
