import { describe, expect, it } from "vitest";

import {
  approvalPolicyPromptContext,
  evaluateApprovalDraftIntegrity,
  evaluateApprovalPreparationText,
  resolveApprovalPolicySnapshot,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
const dutiesUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
const definitionUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031805825";
const thresholdUrl = "https://law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000070098";

const incompleteClaim = "계속거래 등에 관한 계약에서는 사업자가 계약 내용을 적은 계약서를 소비자에게 발급해야 하며, 자동결제나 구독 계약을 해지할 때 과도한 위약금을 청구해서는 안 됩니다.";
const completeClaim = [
  "방문판매법상 계속거래는 1개월 이상 계속적으로 재화나 서비스를 공급하고, 중도 해지 시 대금 환급 제한 또는 위약금 약정이 있는 거래를 말합니다.",
  "매달 결제된다는 이유만으로 모든 자동결제나 구독 서비스가 방문판매법상 계속거래에 해당하는 것은 아닙니다.",
  "방문판매법상 계속거래 가운데 법 제30조의 사전 설명과 계약서 발급 의무는 시행령에서 정한 금액 10만원 및 기간 3개월 이상의 계약에 적용됩니다.",
  "적용 여부는 계약 기간, 환급·위약금 약정과 거래 형태를 확인해야 합니다.",
].join(" ");

describe("approval legal scope policy", () => {
  it("adds the legal applicability contract only to the WordPress life-economy prompt", () => {
    const context = approvalPolicyPromptContext(snapshot);
    expect(context).toContain("Legal applicability contract");
    expect(context).toContain("never equate recurring payment with a continuing transaction");
    expect(context).toContain("not every automatic payment or subscription qualifies");
  });

  it("blocks a continuing-transaction statement that omits definition, scope, thresholds, and their official sources", () => {
    const issues = evaluateApprovalPreparationText(incompleteClaim, snapshot, {
      sourceUrls: [dutiesUrl],
      reviewedAt: "2026-08-02T00:00:00.000Z",
    });
    const messages = issues.map((issue) => issue.message).join("\n");

    expect(messages).toContain("법정 정의와 성립 요건");
    expect(messages).toContain("모든 자동결제·구독");
    expect(messages).toContain("현재 금액·기간 기준");
    expect(messages).toContain("정의를 확인할 수 있는 국가법령정보센터");
    expect(messages).toContain("시행령 공식 출처");
  });

  it("accepts complete applicability wording with the three official provision roles", () => {
    expect(evaluateApprovalPreparationText(completeClaim, snapshot, {
      sourceUrls: [dutiesUrl, definitionUrl, thresholdUrl],
      reviewedAt: "2026-08-02T00:00:00.000Z",
    })).toEqual([]);
  });

  it("blocks external Draft execution even when the old three-claim Evidence pack itself is marked verified", () => {
    const document = approvalDocument(incompleteClaim, [dutiesUrl]);
    const result = evaluateApprovalDraftIntegrity(document);

    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("법정 정의와 성립 요건");
  });

  it("keeps a complete, source-backed continuing-transaction manuscript Draft-eligible", () => {
    const result = evaluateApprovalDraftIntegrity(
      approvalDocument(completeClaim, [dutiesUrl, definitionUrl, thresholdUrl]),
    );
    expect(result).toEqual({ passed: true, reasons: [] });
  });
});

function approvalDocument(text: string, sourceUrls: readonly string[]): ContentDocument {
  return {
    id: "legal-scope-content",
    title: "고정지출 줄이는 방법",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-02T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      approvalPolicy: snapshot,
      approvalEvidence: {
        version: "1.0",
        status: "verified",
        coverageStatus: "verified",
        reviewedAt: "2026-08-02T00:00:00.000Z",
        sources: sourceUrls.map((url, index) => ({
          sourceId: `source-${index}`,
          url,
          canonicalUrl: url,
          title: "국가법령정보센터",
          publisher: "국가법령정보센터",
          sourceType: "official_law" as const,
          retrievedAt: "2026-08-02T00:00:00.000Z",
          verified: true,
          provenance: "citation" as const,
          facts: [],
        })),
      },
      approvalDuplicateCheck: {
        version: "1.0",
        status: "passed",
        checkedAt: "2026-08-02T00:00:00.000Z",
        comparedContentIds: [],
        reasons: [],
      },
    },
    blocks: [
      { id: "claim", type: "paragraph", text },
      { id: "source", type: "paragraph", text: "정보 기준일 및 최종 검토일은 2026년 8월 1일입니다." },
    ],
  };
}
