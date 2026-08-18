import { describe, expect, it } from "vitest";

import {
  determineContentPlanQualityTarget,
  effectiveContentDepth,
  normalizeContentPlanQualityTarget,
  type ContentPlanQualityTarget,
} from "../../../../core/content";

describe("ContentDepthPolicy", () => {
  it.each([
    ["간단 사용법", "standard"],
    ["general informational article", "standard"],
    ["deep health guide", "deep"],
    ["product comparison", "comparison"],
  ] as const)("derives %s as %s without a length target", (contentType, depth) => {
    const target = determineContentPlanQualityTarget({ contentType, readerProblem: "독자 문제" });
    expect(target.contentDepth).toBe(depth);
    expect(target.readerProblem).toBe("독자 문제");
    expect(target.requiredContentElements.length).toBeGreaterThan(2);
    expect(target).not.toHaveProperty("targetLengthRange");
    expect(target).not.toHaveProperty("targetSectionCount");
    expect(target).not.toHaveProperty("safetyFloor");
  });

  it("classifies health complexity as deep without defining it by length", () => {
    const target = determineContentPlanQualityTarget({
      contentType: "간단한 설명",
      domain: "건강",
      readerProblem: "혈압 변화 판단",
    });
    expect(target.contentDepth).toBe("deep");
    expect(target.decisionCriteria).not.toHaveLength(0);
    expect(target.warningsOrExceptions).not.toHaveLength(0);
  });

  it("never creates quick for new planning", () => {
    expect(determineContentPlanQualityTarget({
      contentType: "quick checklist",
      readerProblem: "기록 노트 시작 방법",
    }).contentDepth).toBe("standard");
  });

  /**
   * The approval prompt context is stringified into `projectStrategy` for every
   * candidate of an approval Project, and it contains both `comparison` and
   * `체크리스트`. Classifying on it pinned every article of 밝은재테크 to
   * `comparison` with a table and a checklist forced, whatever the topic was.
   */
  const approvalProjectStrategy = JSON.stringify({
    primaryTopic: "생활재테크",
    approvalPolicy: [
      "Approval writing strategy: produce people-first, unique, non-commodity content that gives the reader a usable observation order, decision criteria, exceptions, comparison, or next action unavailable from a generic summary.",
      "Original Contribution: 단순 요약·재작성이 아니라 주제에 적합한 설명, 비교, 사례, 계산, 체크리스트, 주의점 또는 선택 기준으로 고유한 가치를 더하는지 평가한다.",
    ].join("\n"),
  });

  it("keeps a procedural approval topic out of comparison when the Project context mentions comparison", () => {
    const target = determineContentPlanQualityTarget({
      contentType: "guide",
      selectedTopic: "근로장려금 신청",
      searchIntent: "근로장려금을 어떻게 신청하는지 알아보기",
      readerProblem: "신청 절차와 준비 서류를 모름",
      projectStrategy: approvalProjectStrategy,
    });

    expect(target.contentDepth).toBe("standard");
    expect(target.tableNeeds).toBe(false);
    expect(target.comparisonNeeds).toHaveLength(0);
    expect(target.requiredContentElements).not.toContain("차이와 장단점");
  });

  it("does not force a checklist from the Project context alone", () => {
    expect(determineContentPlanQualityTarget({
      selectedTopic: "종합소득세 신고 기간",
      readerProblem: "언제까지 신고해야 하는지 모름",
      projectStrategy: approvalProjectStrategy,
    }).checklistNeeds).toBe(false);
  });

  it("still classifies a genuinely comparative topic as comparison", () => {
    const target = determineContentPlanQualityTarget({
      selectedTopic: "전세와 월세 차이",
      readerProblem: "전세와 월세 중 무엇이 유리한지 판단하지 못함",
      projectStrategy: approvalProjectStrategy,
    });

    expect(target.contentDepth).toBe("comparison");
    expect(target.tableNeeds).toBe(true);
  });

  it("honours the depth the plan declared over keyword classification", () => {
    expect(determineContentPlanQualityTarget({
      contentDepth: "standard",
      selectedTopic: "전세와 월세 차이",
      readerProblem: "전세와 월세 중 무엇이 유리한지 판단하지 못함",
    }).contentDepth).toBe("standard");
  });

  it("reads a declared legacy quick depth as standard instead of reclassifying", () => {
    expect(determineContentPlanQualityTarget({
      contentDepth: "quick",
      selectedTopic: "전세와 월세 차이",
      readerProblem: "전세와 월세 중 무엇이 유리한지 판단하지 못함",
    }).contentDepth).toBe("standard");
  });

  it("reads legacy quick and legacy length fields as standard policy without preserving length goals", () => {
    const legacy = {
      contentDepth: "quick",
      targetLengthRange: { min: 2_000, preferred: 2_800, max: 3_500 },
      targetSectionCount: { min: 3, preferred: 3, max: 4 },
      safetyFloor: 1_700,
      requiredContentElements: ["실행 방법"],
      readerProblem: "기록 방법",
    } as unknown as ContentPlanQualityTarget;
    const normalized = normalizeContentPlanQualityTarget(legacy, { contentType: "article" });
    expect(normalized.contentDepth).toBe("quick");
    expect(effectiveContentDepth(normalized.contentDepth)).toBe("standard");
    expect(normalized.requiredContentElements).toEqual(["실행 방법"]);
    expect(normalized).not.toHaveProperty("targetLengthRange");
  });
});
