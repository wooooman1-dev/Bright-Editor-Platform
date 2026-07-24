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
