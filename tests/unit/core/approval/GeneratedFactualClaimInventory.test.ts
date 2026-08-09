import { describe, expect, it } from "vitest";

import {
  applyGeneratedFactualClaimInventory,
  generatedFactualInventoryIntegrityReason,
  guardQualityReviewFactualClaims,
  type GeneratedFactualClaimInventoryDraft,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

function document(paragraphs: readonly string[]): ContentDocument {
  return {
    id: "content-1",
    title: "카드 명세서 확인 방법",
    blocks: paragraphs.map((text, index) => ({ id: `p-${index}`, type: "paragraph" as const, text })),
    metadata: {
      buttonCount: 0, createdAt: "2026-08-09T00:00:00.000Z", generator: "test", imageCount: 0,
      language: "ko", readingTime: 1, source: "test", updatedAt: "2026-08-09T00:00:00.000Z",
      version: 1, videoCount: 0, wordCount: 20,
    },
  };
}

function draft(input: Partial<GeneratedFactualClaimInventoryDraft> = {}): GeneratedFactualClaimInventoryDraft {
  return {
    claimId: "claim-verify",
    planningClaimId: "",
    origin: "generation",
    risk: "verify",
    surfaceText: "취소 처리와 청구 반영은 서로 다른 단계일 수 있다.",
    statement: "취소 처리와 청구 반영은 서로 다른 단계일 수 있다.",
    kind: "general",
    normalizedValueJson: "{}",
    qualifiers: { subject: "", scope: "", basis: "", note: "" },
    temporalRequirementJson: "null",
    evidenceUrl: "https://www.fss.or.kr/card",
    evidenceExcerpt: "취소 처리와 청구 반영은 서로 다른 단계일 수 있다.",
    ...input,
  };
}

describe("Generated factual Claim inventory", () => {
  it("keeps NONE-only advice at zero cost with an explicit empty inventory", () => {
    const original = document(["큰 금액부터 확인하세요.", "영수증과 비교하세요."]);
    const result = applyGeneratedFactualClaimInventory({ document: original, drafts: [], decisions: [], fallbackTitle: original.title });
    expect(result.record.items).toEqual([]);
    expect(result.document.blocks).toEqual(original.blocks);
  });

  it("retains verified VERIFY without making it blocking", () => {
    const original = document(["취소 처리와 청구 반영은 서로 다른 단계일 수 있다.", "영수증과 비교하세요."]);
    const result = applyGeneratedFactualClaimInventory({
      document: original,
      drafts: [draft()],
      decisions: [{ retained: true, evidenceStatus: "verify_verified" }],
      fallbackTitle: original.title,
    });
    expect(result.record.retainedClaimIds).toEqual(["claim-verify"]);
    expect(result.document.blocks).toHaveLength(2);
    expect(generatedFactualInventoryIntegrityReason(result.document)).toBeUndefined();
    expect(generatedFactualInventoryIntegrityReason({ ...result.document, blocks: [] })).toContain("generated_factual_surface_missing");
  });

  it("removes unsupported VERIFY while preserving the rest of the manuscript", () => {
    const original = document(["취소 처리와 청구 반영은 서로 다른 단계일 수 있다.", "영수증과 비교하세요."]);
    const result = applyGeneratedFactualClaimInventory({
      document: original,
      drafts: [draft()],
      decisions: [{ retained: false, evidenceStatus: "unsupported", diagnosticCode: "verify_source_not_cited_by_generation" }],
      fallbackTitle: original.title,
    });
    expect(result.record.removedClaimCount).toBe(1);
    expect(result.document.blocks.map((block) => block.type === "paragraph" ? block.text : "")).toEqual(["영수증과 비교하세요."]);
  });

  it("removes reported and unreported new CRITICAL surfaces", () => {
    const original = document(["이 상품의 금리는 7%다.", "신청 조건은 만 19세 이상이다.", "정기결제를 따로 확인하세요."]);
    const result = applyGeneratedFactualClaimInventory({
      document: original,
      drafts: [draft({ claimId: "critical-new", risk: "critical", surfaceText: "이 상품의 금리는 7%다.", statement: "이 상품의 금리는 7%다.", evidenceUrl: "", evidenceExcerpt: "" })],
      decisions: [{ retained: false, evidenceStatus: "unsupported", diagnosticCode: "unplanned_generated_critical" }],
      fallbackTitle: original.title,
    });
    expect(result.record.items.filter((item) => item.risk === "critical" && item.disposition === "removed")).toHaveLength(2);
    const readerText = result.document.blocks.map((block) => block.type === "paragraph" ? block.text : "").join(" ");
    expect(readerText).not.toContain("7%");
    expect(readerText).not.toContain("만 19세");
    expect(readerText).toContain("정기결제");
  });

  it("allows Quality Review only to return the complete unchanged verified inventory", () => {
    const generated = applyGeneratedFactualClaimInventory({
      document: document(["취소 처리와 청구 반영은 서로 다른 단계일 수 있다."]),
      drafts: [draft()],
      decisions: [{ retained: true, evidenceStatus: "verify_verified" }],
      fallbackTitle: "카드 명세서 확인 방법",
    }).document;
    expect(guardQualityReviewFactualClaims({ current: generated, candidate: generated, drafts: [draft()] }).passed).toBe(true);
    expect(guardQualityReviewFactualClaims({
      current: generated,
      candidate: document(["취소 처리와 청구 반영은 서로 다른 단계일 수 있다.", "새 상품 조건은 2026년 9월부터 적용된다."]),
      drafts: [draft(), draft({ claimId: "quality-new", origin: "quality_review", surfaceText: "새 상품 조건은 2026년 9월부터 적용된다.", statement: "새 상품 조건은 2026년 9월부터 적용된다.", risk: "critical" })],
    }).reason).toBe("quality_new_factual_claim_added");
  });
});
