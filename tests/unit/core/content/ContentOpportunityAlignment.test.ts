import { describe, expect, it } from "vitest";

import {
  analyzeContentOpportunityAlignment,
  applyContentOpportunityPolicy,
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  titleContainsPrimaryKeyword,
  type ContentDocument,
} from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "장 건강 글", selectionMode: "userSpecified", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["유산균", "식이섬유", "장내 환경"], searchIntent: "장 건강을 개선하는 실천 방법 탐색",
  audience: "일반 성인", contentType: "guide", contentAngle: "음식과 생활습관 중심", readerProblem: "장 건강 관리 기준 부족",
  expectedCoverage: ["유산균", "식이섬유", "장내 환경", "생활습관"], selectionRationale: "사용자가 지정한 주제",
  opportunityEvidence: [{ source: "unknown", summary: "외부 검색량 데이터 없음" }], confidence: 0.8, cautions: [], projectId: "project-1",
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });

describe("Content Opportunity manuscript alignment", () => {
  it("corrects a semantically aligned title that only omitted the exact keyword", () => {
    const original = document("음식과 생활습관으로 장을 건강하게 지키는 실천 가이드", [
      ["장내 환경을 이해하는 기준", "장 건강은 장내 환경과 식이섬유 섭취를 함께 살펴야 합니다. 유산균 선택과 생활습관을 실천하는 방법을 설명합니다."],
      ["유산균과 식이섬유 실천", "유산균과 식이섬유는 장 건강을 개선할 때 실제 식사와 생활습관 안에서 조절해야 합니다."],
    ]);
    const result = applyContentOpportunityPolicy(original, opportunity);
    expect(result.alignment.status).toBe("aligned");
    expect(titleContainsPrimaryKeyword(result.document.title, opportunity.primaryKeyword)).toBe(true);
  });

  it("does not attach the keyword to an unrelated chronic-inflammation manuscript", () => {
    const original = document("만성 염증 관리 가이드", [
      ["CRP 검사 수치", "만성 염증과 CRP 검사 수치를 이해하고 의료진과 검사 결과를 상담하는 기준을 설명합니다."],
      ["항염 식단", "항염 식단과 염증 반응을 줄이는 생활 방식을 정리합니다."],
    ]);
    const result = applyContentOpportunityPolicy(original, opportunity);
    expect(result.alignment.status).toBe("mismatch");
    expect(result.document.title).toBe("만성 염증 관리 가이드");
    expect(result.document.title).not.toContain("장 건강 관리 방법:");
  });

  it("reports missing secondary-keyword support and blocks an otherwise high score", () => {
    const unsupported = document("장 건강 관리 방법 실천 가이드", [
      ["장 건강 생활습관", "장 건강 관리 방법은 수면과 활동 리듬을 점검하는 일에서 시작합니다. 장 건강을 위해 생활습관을 꾸준히 조절합니다."],
      ["매일 확인할 기준", "장 건강 상태와 생활습관 변화를 기록하고 자신의 반응을 관찰합니다."],
    ]);
    const alignment = analyzeContentOpportunityAlignment(unsupported, opportunity);
    expect(alignment.review.secondaryKeywordSupport.pass).toBe(false);
    const report = new QualityEngine().review(unsupported, { opportunity, primaryKeyword: opportunity.primaryKeyword, searchIntent: opportunity.searchIntent });
    expect(report.approved).toBe(false);
    expect(report.approvalState).toBe("blocked");
    expect(report.tasks.some((task) => task.message.includes("보조 키워드"))).toBe(true);
  });
});

function document(title: string, sections: readonly (readonly [string, string])[]): ContentDocument {
  return {
    id: "content-1",
    title,
    metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 100, primarySearchIntent: opportunity.searchIntent, metaDescription: `${opportunity.primaryKeyword}을 중심으로 음식과 생활습관, 장내 환경을 구체적으로 설명하는 실천 안내입니다.` },
    blocks: sections.flatMap(([heading, text], index) => [{ id: `h-${index}`, type: "heading" as const, level: 2 as const, text: heading }, { id: `p-${index}`, type: "paragraph" as const, text }]),
  };
}
