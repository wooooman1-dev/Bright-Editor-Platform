import { describe, expect, it } from "vitest";

import {
  approvalPolicyPromptContext,
  evaluateApprovalPreparationText,
  normalizeContentPurpose,
  resolveApprovalPolicySnapshot,
} from "../../../../core/approval";

describe("ApprovalPolicy", () => {
  it("keeps legacy or unknown content purpose compatible as standard", () => {
    expect(normalizeContentPurpose(undefined)).toBe("standard");
    expect(normalizeContentPurpose("legacy")).toBe("standard");
    expect(normalizeContentPurpose("adsense_approval")).toBe("adsense_approval");
  });

  it("requires an approved profile for approval preparation", () => {
    expect(() => resolveApprovalPolicySnapshot("adsense_approval", undefined)).toThrow(
      "승인 준비 모드에는 승인된 Project 정책 프로필이 필요합니다.",
    );
    expect(resolveApprovalPolicySnapshot("standard", undefined)).toBeUndefined();
  });

  it("resolves the Vivarain policy snapshot and prompt context", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1");
    expect(snapshot).toMatchObject({
      contentPurpose: "adsense_approval",
      policyId: "adsense_approval_mode",
      policyVersion: "1.0",
      profileId: "tistory_vivarain_art_v1",
      profileVersion: "1.0",
    });
    expect(approvalPolicyPromptContext(snapshot!)).toContain(
      "Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md",
    );
    expect(approvalPolicyPromptContext(snapshot!)).toContain("Never claim or imply that AdSense approval is guaranteed.");
  });

  it("blocks guarantee, placeholder, fabricated experience, and missing source signals", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
    const issues = evaluateApprovalPreparationText(
      "이 글이면 애드센스 100% 승인됩니다. 제가 직접 미술관을 방문해 작품을 보았습니다. 내용은 추가 예정입니다.",
      snapshot,
    );
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "APPROVAL_GUARANTEE_CLAIM",
      "PLACEHOLDER_CONTENT",
      "FABRICATED_EXPERIENCE",
      "PROFILE_SOURCE_REQUIREMENT_MISSING",
    ]));
  });

  it("accepts a source-aware factual review without deterministic policy violations", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
    expect(evaluateApprovalPreparationText(
      "공식 소장처의 작품 페이지를 주요 출처로 확인했습니다. 작품의 제작연도와 재료를 구분해 설명하고, 해석은 하나의 감상 관점으로 제시합니다. 최종 검토일은 2026-07-27입니다.",
      snapshot,
    )).toEqual([]);
  });
});
