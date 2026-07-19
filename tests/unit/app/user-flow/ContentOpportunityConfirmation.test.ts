import { describe, expect, it } from "vitest";

import { createContentFromPlan, createProject, createWorkspace, emptyUserData, type ContentPlanningResult } from "../../../../app/user-flow/user-data";
import { createContentOpportunityCandidate } from "../../../../core/content";

const candidate = (topic: string, keyword: string, intent: string, secondaryKeywords: readonly string[]) => createContentOpportunityCandidate({
  sourceRequest: "건강 콘텐츠 기회를 골라줘", selectionMode: "automatic", selectedTopic: topic, primaryKeyword: keyword,
  secondaryKeywords, searchIntent: intent, audience: "일반 성인", contentType: "guide", contentAngle: `${topic} 실천 안내`,
  readerProblem: `${topic} 기준 부족`, expectedCoverage: secondaryKeywords, selectionRationale: `${topic} 콘텐츠 공백`,
  opportunityEvidence: [{ source: "inferred", summary: "프로젝트 콘텐츠 공백 추론" }], confidence: 0.8, cautions: [], projectId: "project-1",
});
const gut = candidate("장 건강 관리", "장 건강 관리 방법", "장 건강 개선 방법 탐색", ["유산균", "식이섬유"]);
const inflammation = candidate("만성 염증 관리", "만성 염증 관리 방법", "만성 염증 증상과 관리 탐색", ["CRP", "항염 식단"]);
const plan: ContentPlanningResult = {
  interpretedIntent: "건강 주제 선정", domain: "health", targetAudience: gut.audience, contentGoal: gut.contentAngle,
  recommendedPrimaryKeyword: gut.primaryKeyword, keywordCandidates: [gut.primaryKeyword, inflammation.primaryKeyword], searchIntent: gut.searchIntent,
  recommendedContentType: gut.contentType, recommendedPlatforms: [], suggestedTitleAngles: [gut.selectedTopic, inflammation.selectedTopic],
  relatedKeywords: gut.secondaryKeywords, contentCluster: gut.expectedCoverage, recommendationReason: gut.selectionRationale, confidence: 0.8,
  estimateDisclosure: "AI 추정이며 검색량 실측값이 아님", selectionMode: "automatic", opportunityCandidates: [gut, inflammation],
};

describe("atomic Content Opportunity confirmation", () => {
  it("confirms every field from candidate B without retaining candidate A fields", () => {
    const workspace = createWorkspace(emptyUserData, "Studio", "workspace-1");
    const data = createProject(workspace, { id: "project-1", name: "Health", brandIdFactory: () => "brand-1", now: "now" });
    const next = createContentFromPlan(data, { id: "content-1", projectId: "project-1", naturalLanguageRequest: "건강 글", plan, opportunity: inflammation, selectedPublishingAccountIds: [], now: "now" });
    expect(next.contents[0]).toMatchObject({
      primaryKeyword: "만성 염증 관리 방법",
      relatedKeywords: ["CRP", "항염 식단"],
      searchIntent: "만성 염증 증상과 관리 탐색",
      title: "만성 염증 관리",
      opportunity: { opportunityId: inflammation.opportunityId, selectedTopic: "만성 염증 관리" },
    });
    expect(next.contents[0].relatedKeywords).not.toContain("유산균");
  });

  it("does not allow a keyword-only switch that reuses the first candidate plan", () => {
    const workspace = createWorkspace(emptyUserData, "Studio", "workspace-1");
    const data = createProject(workspace, { id: "project-1", name: "Health", brandIdFactory: () => "brand-1", now: "now" });
    const legacyPlan = { ...plan, opportunityCandidates: undefined };
    expect(() => createContentFromPlan(data, { id: "content-1", projectId: "project-1", naturalLanguageRequest: "건강 글", plan: legacyPlan, primaryKeyword: inflammation.primaryKeyword, selectedPublishingAccountIds: [], now: "now" }))
      .toThrow("대표 키워드만 변경할 수 없습니다");
  });
});
