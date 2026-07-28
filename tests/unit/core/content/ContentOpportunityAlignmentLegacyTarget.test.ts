import { describe, expect, it } from "vitest";

import {
  analyzeContentOpportunityAlignment,
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ContentDocument,
} from "../../../../core/content";

const confirmed = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "건강검진 결과표 읽는 법",
  selectionMode: "automatic",
  selectedTopic: "건강검진 결과표 읽는 법",
  primaryKeyword: "건강검진 결과표",
  secondaryKeywords: ["혈압", "검사 결과"],
  searchIntent: "건강검진 결과를 순서대로 확인하고 후속 관리 기준을 알고 싶다",
  audience: "건강검진 결과를 받은 일반 성인",
  contentType: "guide",
  contentAngle: "주요 수치와 후속 관리 기준",
  readerProblem: "건강검진 결과에서 무엇을 먼저 확인해야 하는지 모른다",
  expectedCoverage: ["혈압", "검사 결과", "후속 관리"],
  selectionRationale: "건강정보 프로젝트의 실용 가이드",
  opportunityEvidence: [{ source: "unknown", summary: "레거시 저장 데이터 재현" }],
  confidence: 0.8,
  cautions: [],
  projectId: "project-1",
}), {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  confirmedAt: "2026-07-28T00:00:00.000Z",
});

const article: ContentDocument = {
  id: "content-1",
  title: "건강검진 결과표 읽는 법과 후속 관리 기준",
  blocks: [
    { id: "intro", type: "paragraph", text: "건강검진 결과표는 혈압과 검사 결과를 순서대로 확인하고 이상 소견이 있으면 후속 관리 기준을 정해야 합니다." },
    { id: "heading", type: "heading", level: 2, text: "혈압과 검사 결과 확인" },
    { id: "body", type: "paragraph", text: "혈압 수치와 기준 범위를 확인하고 이전 결과와 비교합니다. 반복해서 벗어나면 의료진과 상담합니다." },
  ],
};

describe("Content Opportunity alignment legacy target compatibility", () => {
  it("rebuilds a missing qualityTarget before reading coreQuestions", () => {
    const legacy = { ...confirmed, qualityTarget: undefined } as unknown as typeof confirmed;

    const alignment = analyzeContentOpportunityAlignment(article, legacy);

    expect(alignment.review.searchIntentFulfillment.evidence.length).toBeGreaterThan(0);
    expect(alignment.review.contentOpportunityConsistency).toBeDefined();
  });
});
