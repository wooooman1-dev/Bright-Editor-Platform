import { describe, expect, it } from "vitest";

import { resolveConfirmedGenerationKeywords, resolveConfirmedGenerationOpportunity } from "../../../../app/application/ConfirmedGenerationPolicy";
import { confirmContentOpportunity, createContentOpportunityCandidate } from "../../../../core/content";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "장 건강 글", selectionMode: "userSpecified", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["유산균"], searchIntent: "장 건강 개선 방법 탐색", audience: "일반 성인", contentType: "guide", contentAngle: "실천 안내",
  readerProblem: "관리 기준 부족", expectedCoverage: ["유산균"], selectionRationale: "사용자 지정", opportunityEvidence: [{ source: "unknown", summary: "외부 데이터 없음" }],
  confidence: 0.8, cautions: [], projectId: "project-1",
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });

describe("confirmed primary keyword generation policy", () => {
  it("rejects generation until Content has a confirmed primary keyword", () => {
    expect(() => resolveConfirmedGenerationKeywords({ relatedKeywords: ["후보"] }, ["후보"]))
      .toThrow("대표 키워드를 먼저 선택해 주세요.");
  });

  it("rejects a request keyword that differs from the stored canonical keyword", () => {
    expect(() => resolveConfirmedGenerationKeywords({ primaryKeyword: "장 건강 관리 방법" }, ["만성 염증 완화 방법"]))
      .toThrow("확정된 대표 키워드와 생성 요청의 대표 키워드가 일치하지 않습니다");
  });

  it("uses the NFKC-normalized stored keyword and stored related keywords", () => {
    const keywords = resolveConfirmedGenerationKeywords(
      { primaryKeyword: "  장 건강   관리 방법  ", relatedKeywords: ["저등급 염증", "저등급 염증"] },
      ["장 건강 관리 방법", "요청이 임의로 바꾼 관련어"],
    );

    expect(keywords).toEqual(["장 건강 관리 방법", "저등급 염증"]);
  });

  it("uses the stored atomic opportunity and rejects a mixed topic before generation", () => {
    expect(() => resolveConfirmedGenerationOpportunity({ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", opportunity }, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1",
      opportunityId: opportunity.opportunityId, opportunityVersion: opportunity.version, opportunityFingerprint: opportunity.fingerprint,
      primaryKeyword: opportunity.primaryKeyword, topic: "만성 염증 관리", searchIntent: opportunity.searchIntent,
      secondaryKeywords: opportunity.secondaryKeywords, keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
    })).toThrow("현재 원고와 일치하지 않습니다");
  });
});
