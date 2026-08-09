import { describe, expect, it } from "vitest";

import {
  approvalGenerationTrace,
  classifyApprovalPassageOrigin,
  withApprovalGenerationTrace,
} from "../../../../../app/application/approval/ApprovalGenerationTrace";
import type { ContentDocument } from "../../../../../core/content";
import { resolveApprovalPolicySnapshot } from "../../../../../core/approval";

const combinedDate = "정보 기준일 및 최종 검토일은 2026년 8월 1일입니다.";
const correctedDate = "정보 기준일은 2026년 8월 1일입니다.";
const broadLegal = "계속거래 등에 관한 계약에서는 사업자가 계약서를 소비자에게 발급해야 합니다.";
const correctedLegal = "모든 자동결제나 구독 서비스가 방문판매법상 계속거래에 해당하는 것은 아닙니다.";

describe("approval Generation trace", () => {
  it("captures only approval-risk passages from the pre-Review Generation document", () => {
    const traced = withApprovalGenerationTrace(document([combinedDate, broadLegal, "일반적인 마무리 문장입니다."]));
    const trace = approvalGenerationTrace(traced);

    expect(trace).toMatchObject({ version: "1.0" });
    expect(trace?.passages.map((item) => item.text)).toEqual([combinedDate, broadLegal]);
  });

  it("preserves the original Generation passages when the Quality Review changes the manuscript", () => {
    const generated = withApprovalGenerationTrace(document([combinedDate, broadLegal]));
    const reviewed = withApprovalGenerationTrace(document([correctedDate, correctedLegal]), generated);
    const trace = approvalGenerationTrace(reviewed);

    expect(trace?.passages.map((item) => item.text)).toEqual([combinedDate, broadLegal]);
    expect(classifyApprovalPassageOrigin(reviewed, correctedDate)).toBe("quality_review");
    expect(classifyApprovalPassageOrigin(reviewed, correctedLegal)).toBe("quality_review");
  });

  it("classifies an unchanged final passage as originating in Generation", () => {
    const generated = withApprovalGenerationTrace(document([correctedDate, correctedLegal]));
    const reviewed = withApprovalGenerationTrace(document([correctedDate, correctedLegal]), generated);

    expect(classifyApprovalPassageOrigin(reviewed, correctedDate)).toBe("generation");
    expect(classifyApprovalPassageOrigin(reviewed, correctedLegal)).toBe("generation");
  });
});

function document(passages: readonly string[]): ContentDocument {
  return {
    id: "approval-trace-content",
    title: "고정지출 줄이는 방법",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-01T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1"),
    },
    blocks: passages.map((text, index) => ({ id: `p-${index + 1}`, type: "paragraph" as const, text })),
  };
}
