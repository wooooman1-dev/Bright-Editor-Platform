import { describe, expect, it } from "vitest";

import {
  approvalPolicyPromptContext,
  approvalPolicySnapshotFromEditorialContext,
  evaluateApprovalPreparationText,
  normalizeContentPurpose,
  peopleFirstValueAndTrustPrinciple,
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

  it("resolves the Vivarain policy snapshot and evidence-first prompt context", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1");
    expect(snapshot).toMatchObject({
      contentPurpose: "adsense_approval",
      policyId: "adsense_approval_mode",
      policyVersion: "1.0",
      profileId: "tistory_vivarain_art_v1",
      profileVersion: "1.0",
    });
    const context = approvalPolicyPromptContext(snapshot!);
    expect(context).toContain("Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md");
    expect(context).toContain("Docs/current/01_PRODUCT/17_ADSENSE_APPROVAL_READINESS_BLUEPRINT.md");
    expect(context).toContain("unique, non-commodity content");
    expect(context).toContain("Never claim or imply that AdSense approval is guaranteed.");
  });

  it("delivers the canonical people-first WordPress profile through its snapshot prompt context", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const context = approvalPolicyPromptContext(snapshot);

    expect(snapshot.requiredPrinciples).toContain(peopleFirstValueAndTrustPrinciple);
    for (const requirement of [
      "구체적인 질문이나 문제를 먼저 정의",
      "단순 요약·재작성하지 않고",
      "확인되지 않은 새로운 사실, 수치, 경험담, 성공 사례 또는 전문가 자격",
      "정보 밀도를 유지하면서 중복과 불필요한 장문을 제거",
    ]) {
      expect(snapshot.requiredPrinciples.some((principle) => principle.includes(requirement))).toBe(true);
    }
    for (const perspective of [
      "Reader Value",
      "Original Contribution",
      "Factual Reliability",
      "Completeness",
      "Transparency",
      "Readability",
      "Search Intent Satisfaction",
      "Policy Safety",
    ]) {
      expect(snapshot.qualityChecks.some((check) => check.startsWith(`${perspective}:`))).toBe(true);
    }
    expect(context).toContain(peopleFirstValueAndTrustPrinciple);
    expect(snapshot.requiredPublishingCategoryNames).toEqual(["생활재테크"]);
    expect(snapshot.siteIdentity).toBe("밝은재테크");
    expect(snapshot.contentDomain).toContain("생활경제");
    expect(snapshot.profileDisplayName).toBe("WordPress · 밝은재테크");
    expect(context).toContain("Required publishing categories: 생활재테크");
    expect(context).not.toContain("Required publishing categories: 생활경제");
    expect(context).toContain("Approval profile: WordPress · 밝은재테크@1.0");
    expect(context).toContain("Site and brand identity (metadata only): 밝은재테크");
    expect(context).toContain("Content domain: 생활경제, 생활금융, 정부지원, 세금, 주거 정보");
    expect(context).toContain("publishing Category labels are metadata, not default search keywords");
    expect(context).toContain("Date ownership contract");
    expect(context).toContain("Never combine 정보 기준일 with 최종 검토일");
    expect(context).not.toContain("wordpress_life_economy_v1");
    expect(context).not.toMatch(/Google\s*AI\s*봇|AI\s*봇에게\s*잘\s*보이/iu);
    expect(context).not.toMatch(/\b\d{3,}\s*(?:자|단어)\b/u);
    expect(snapshot.requiredPrinciples).toContain("목표 글자 수, 최소 문단 수, 최소 게시물 수 또는 최소 Category 수를 승인 Gate로 사용하지 않는다.");
    expect(snapshot.prohibitedClaims.some((claim) => claim.includes("수익") && claim.includes("보장"))).toBe(true);
    expect(snapshot.prohibitedClaims).toEqual(expect.arrayContaining([
      "AdSense 승인 보장",
      "100% 승인",
      "반드시 통과",
    ]));
  });

  it("restores the stable profile ID from public and legacy prompt labels", () => {
    const current = approvalPolicyPromptContext(
      resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
    );
    const legacy = [
      "Content purpose: adsense_approval",
      "Approval policy: adsense_approval_mode@1.0",
      "Approval profile: wordpress_life_economy_v1@1.0",
    ].join("\n");

    expect(approvalPolicySnapshotFromEditorialContext(current)?.profileId)
      .toBe("wordpress_life_economy_v1");
    expect(approvalPolicySnapshotFromEditorialContext(legacy)?.profileId)
      .toBe("wordpress_life_economy_v1");
  });

  it("keeps the WordPress 생활경제 content-domain rules out of the Tistory profile", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
    const profileContract = [
      ...snapshot.requiredPrinciples,
      ...snapshot.prohibitedClaims,
      ...snapshot.sourceRequirements,
      ...snapshot.qualityChecks,
    ].join("\n");

    expect(profileContract).not.toMatch(/생활경제|정부지원|소득 기준|세율|대출 승인 보장|지원금 수령 보장/u);
    expect(profileContract).not.toContain(peopleFirstValueAndTrustPrinciple);
    expect(snapshot).toMatchObject({
      profileDisplayName: "Tistory · 비바레인 미술",
      siteIdentity: "비바레인",
      contentDomain: "서양미술 화가와 작품 감상 정보",
    });
    expect(approvalPolicyPromptContext(snapshot)).not.toContain("tistory_vivarain_art_v1");
  });

  it("blocks guarantee, placeholder, fabricated experience, and missing evidence details", () => {
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
      "PROFILE_SOURCE_URL_MISSING",
      "PROFILE_REVIEW_DATE_MISSING",
    ]));
  });

  it("blocks a source label that has no verifiable URL", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
    const issues = evaluateApprovalPreparationText(
      "공식 소장처 자료를 주요 출처로 확인했습니다. 최종 검토일: 2026-07-27",
      snapshot,
    );

    expect(issues).toContainEqual(expect.objectContaining({ code: "PROFILE_SOURCE_URL_MISSING" }));
  });

  it("accepts a source-aware factual review with an HTTPS URL and review date", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
    expect(evaluateApprovalPreparationText(
      "공식 소장처의 작품 페이지 https://www.moma.org/collection/works/79802 를 주요 출처로 확인했습니다. 작품의 제작연도와 재료를 구분해 설명하고, 해석은 하나의 감상 관점으로 제시합니다. 최종 검토일: 2026-07-27",
      snapshot,
    )).toEqual([]);
  });

  it("blocks a combined natural-language information and final-review date sentence", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const issues = evaluateApprovalPreparationText(
      "공식 자료 https://www.gov.kr/portal/main 를 확인했습니다. 정보 기준일과 최종 검토일은 2026년 7월 30일이며 실제 신청 전 최신 공고를 다시 확인해야 합니다.",
      snapshot,
      { reviewedAt: "2026-07-31T00:00:00.000Z" },
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: "PROFILE_REVIEW_DATE_MISSING",
      message: expect.stringContaining("서로 다른 역할"),
    }));
  });

  it("uses canonical Evidence metadata for the official HTTPS URL and system-owned review date", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const issues = evaluateApprovalPreparationText(
      "예금자보호 대상과 보호 한도를 확인하는 순서를 설명합니다. 정보 기준일은 2026년 8월 1일입니다.",
      snapshot,
      {
        sourceUrls: ["https://www.kdic.or.kr/deposit/selectProtectingProducts.do"],
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    );

    expect(issues).not.toContainEqual(expect.objectContaining({ code: "PROFILE_SOURCE_REQUIREMENT_MISSING" }));
    expect(issues).not.toContainEqual(expect.objectContaining({ code: "PROFILE_SOURCE_URL_MISSING" }));
    expect(issues).not.toContainEqual(expect.objectContaining({ code: "PROFILE_REVIEW_DATE_MISSING" }));
  });
});
