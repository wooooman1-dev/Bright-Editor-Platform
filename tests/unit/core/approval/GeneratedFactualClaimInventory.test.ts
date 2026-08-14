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

describe("Generated factual Claim withdrawal does not corrupt neighbouring values", () => {
  function tableDocument(headers: readonly string[], rows: readonly (readonly string[])[]): ContentDocument {
    const base = document(["표는 같은 가정에서 세 방식을 비교합니다."]);
    return {
      ...base,
      blocks: [
        ...base.blocks,
        { id: "comparison", type: "table" as const, headers: [...headers], rows: rows.map((row) => [...row]) },
      ],
    };
  }

  it("does not cut a longer amount in half when a shorter amount is withdrawn", () => {
    const original = tableDocument(
      ["방식", "12회차 납입액", "예시 대출 총이자"],
      [["만기일시상환", "12,060,000원", "720,000원"]],
    );
    const result = applyGeneratedFactualClaimInventory({
      document: original,
      drafts: [draft({ claimId: "critical-amount", risk: "critical", surfaceText: "60,000원", statement: "60,000원", evidenceUrl: "", evidenceExcerpt: "" })],
      decisions: [{ retained: false, evidenceStatus: "unsupported", diagnosticCode: "unreported_generated_critical" }],
      fallbackTitle: original.title,
      protectedSurfaceTexts: ["12,060,000원", "720,000원"],
    });
    const table = result.document.blocks.find((block) => block.type === "table");
    expect(table).toBeDefined();
    // The withdrawn amount is a digit-aligned suffix of the printed value, so it
    // may not be shortened into a fragment such as "12,0".
    expect(table && table.type === "table" ? table.rows.flat() : []).not.toContain("12,0");
    expect(table && table.type === "table" ? table.rows.flat() : []).toContain("12,060,000원");
  });

  it("withdraws an amount that stands alone in its own cell", () => {
    const original = tableDocument(
      ["방식", "월 이자", "예시 대출 총이자"],
      [["만기일시상환", "60,000원", "720,000원"]],
    );
    const result = applyGeneratedFactualClaimInventory({
      document: original,
      drafts: [draft({ claimId: "critical-amount", risk: "critical", surfaceText: "60,000원", statement: "60,000원", evidenceUrl: "", evidenceExcerpt: "" })],
      decisions: [{ retained: false, evidenceStatus: "unsupported", diagnosticCode: "unreported_generated_critical" }],
      fallbackTitle: original.title,
      protectedSurfaceTexts: ["720,000원"],
    });
    const table = result.document.blocks.find((block) => block.type === "table");
    expect(table && table.type === "table" ? table.rows.flat().join("") : "").not.toContain("60,000원");
    expect(table && table.type === "table" ? table.rows.flat() : []).toContain("720,000원");
  });

  it("drops a comparison table instead of publishing rows that kept only their label", () => {
    const original = tableDocument(
      ["방식", "1회차 납입액", "예시 대출 총이자"],
      [["원리금균등상환", "1,032,797원", "393,566원"]],
    );
    const result = applyGeneratedFactualClaimInventory({
      document: original,
      drafts: [
        draft({ claimId: "amount-1", risk: "critical", surfaceText: "1,032,797원", statement: "1,032,797원", evidenceUrl: "", evidenceExcerpt: "" }),
        draft({ claimId: "amount-2", risk: "critical", surfaceText: "393,566원", statement: "393,566원", evidenceUrl: "", evidenceExcerpt: "" }),
      ],
      decisions: [
        { retained: false, evidenceStatus: "unsupported", diagnosticCode: "unreported_generated_critical" },
        { retained: false, evidenceStatus: "unsupported", diagnosticCode: "unreported_generated_critical" },
      ],
      fallbackTitle: original.title,
    });
    expect(result.document.blocks.some((block) => block.type === "table")).toBe(false);
  });
});

describe("Generated factual Claim sweep keeps surfaces the manuscript already sources", () => {
  const disclosure = "아래 계산 예시는 대출원금 1,200만 원, 연 6% 고정금리, 12개월이라는 가정만 놓고 산출했습니다. 수수료와 금리 변동은 반영하지 않았으므로 계약상 청구액을 대신하지 않습니다.";

  function sectionDocument(blocks: readonly ContentDocument["blocks"][number][]): ContentDocument {
    const base = document(["도입 문단입니다."]);
    return { ...base, blocks: [...base.blocks, ...blocks] };
  }

  it("keeps the 정보 기준일 line the approval policy requires in the body", () => {
    const original = sectionDocument([
      { id: "notice", type: "paragraph" as const, text: "정보 기준일: 2026년 8월 14일. 조건은 달라질 수 있습니다." },
    ]);
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    expect(result.record.items).toHaveLength(0);
    expect(result.document.blocks.map((block) => block.type === "paragraph" ? block.text : "").join(" "))
      .toContain("정보 기준일: 2026년 8월 14일");
  });

  it("keeps example figures whose assumptions the same section discloses", () => {
    // The exact section the 대출 상환방식 비교 article shipped with every value
    // stripped out, reconstructed from the disclosure and figures its own
    // inventory recorded as withdrawn.
    const original = sectionDocument([
      { id: "section-2-heading", type: "heading" as const, level: 2, text: "대출 상환방식 비교 표로 보는 납입 패턴과 원금 잔액" },
      { id: "section-2-paragraph-1", type: "paragraph" as const, text: "아래 계산 예시는 대출원금 1,200만 원, 연 6% 고정금리, 12개월, 매월 납부, 거치기간 없음이라는 가정만 놓고 산출했습니다. 수수료, 인지비용, 연체이자, 금리 변동과 실제 금융회사의 원 단위 절사 방식은 반영하지 않았으므로 계약상 청구액을 대신하지 않습니다." },
      { id: "section-2-paragraph-3", type: "table" as const,
        headers: ["방식", "1회차 납입액", "12회차 납입액", "예시 대출 총이자"],
        rows: [
          ["원리금균등상환", "약 1,032,797원", "약 1,032,797원", "약 393,566원"],
          ["원금균등상환", "1,060,000원", "1,005,000원", "390,000원"],
          ["만기일시상환", "60,000원", "12,060,000원", "720,000원"],
        ] },
    ]);
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    expect(result.record.removedClaimCount).toBe(0);
    const table = result.document.blocks.find((block) => block.type === "table");
    const cells = table && table.type === "table" ? table.rows.flat() : [];
    expect(cells).toContain("약 1,032,797원");
    expect(cells).toContain("12,060,000원");
    expect(cells).toContain("720,000원");
    expect(cells).not.toContain("");
    // The disclosure that sources those figures has to survive with them.
    expect(result.document.blocks.some((block) => block.id === "section-2-paragraph-1")).toBe(true);
  });

  it("does not let a disclosure in one section shelter figures in another", () => {
    const original = sectionDocument([
      { id: "section-2-heading", type: "heading" as const, level: 2, text: "상환방식 비교 표" },
      { id: "section-2-p1", type: "paragraph" as const, text: disclosure },
      { id: "section-3-heading", type: "heading" as const, level: 2, text: "지원금 안내" },
      { id: "section-3-p1", type: "paragraph" as const, text: "이 지원금은 매월 350,000원이 지급됩니다." },
    ]);
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    expect(result.record.items.some((item) =>
      item.disposition === "removed" && item.surfaceText.includes("350,000원"))).toBe(true);
  });

  it("withdraws only the sentence that carries the figure, not its whole paragraph", () => {
    const explanation = "공고를 읽을 때는 문서의 구조를 먼저 파악해 두면 이해가 빠릅니다. 이 지원금은 매월 350,000원이 지급됩니다. 표시된 문구를 그대로 옮겨 적어 두면 나중에 비교하기 쉽습니다.";
    const original = sectionDocument([
      { id: "section-2-heading", type: "heading" as const, level: 2, text: "지원금 안내" },
      { id: "section-2-p1", type: "paragraph" as const, text: explanation },
    ]);
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    const paragraph = result.document.blocks.find((block) => block.id === "section-2-p1");
    const text = paragraph && paragraph.type === "paragraph" ? paragraph.text : "";
    expect(text).not.toContain("350,000원");
    // The two sentences that carry no figure explain how to read a public
    // notice; withdrawing them with the amount is what gutted earlier articles.
    expect(text).toContain("공고를 읽을 때는 문서의 구조를 먼저 파악해 두면 이해가 빠릅니다.");
    expect(text).toContain("표시된 문구를 그대로 옮겨 적어 두면 나중에 비교하기 쉽습니다.");
  });

  it("removes withdrawn blocks from longFormStructure instead of leaving dangling ids", () => {
    const base = document(["도입 문단입니다."]);
    const original: ContentDocument = {
      ...base,
      blocks: [
        ...base.blocks,
        { id: "section-2-heading", type: "heading" as const, level: 2, text: "지원금 안내" },
        { id: "section-2-p1", type: "paragraph" as const, text: "이 지원금은 매월 350,000원이 지급됩니다." },
        { id: "section-2-p2", type: "paragraph" as const, text: "공고 문서를 함께 확인해 두면 좋습니다." },
      ],
      metadata: {
        ...base.metadata!,
        longFormStructure: {
          introductionBlockIds: ["p-0"],
          sections: [{ headingBlockId: "section-2-heading", paragraphBlockIds: ["section-2-p1", "section-2-p2"] }],
          conclusionBlockIds: [],
        },
      },
    };
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    const present = new Set(result.document.blocks.map((block) => block.id));
    const structure = result.document.metadata!.longFormStructure!;
    const referenced = [
      ...structure.introductionBlockIds,
      ...structure.sections.flatMap((section) => [section.headingBlockId, ...section.paragraphBlockIds]),
      ...structure.conclusionBlockIds,
    ];
    expect(present.has("section-2-p1")).toBe(false);
    expect(referenced.filter((id) => !present.has(id))).toEqual([]);
    expect(referenced).toContain("section-2-p2");
  });

  it("does not split a decimal figure into two sentences", () => {
    const original = sectionDocument([
      { id: "section-2-heading", type: "heading" as const, level: 2, text: "금리 안내" },
      { id: "section-2-p1", type: "paragraph" as const, text: "설명 문장입니다. 적용 금리는 12.5%입니다." },
    ]);
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    const removed = result.record.items.filter((item) => item.disposition === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.surfaceText).toBe("적용 금리는 12.5%입니다.");
  });

  it("still sweeps a bare 예시 sentence that discloses no assumptions", () => {
    const original = sectionDocument([
      { id: "section-2-heading", type: "heading" as const, level: 2, text: "예시" },
      { id: "section-2-p1", type: "paragraph" as const, text: "예를 들어 월 납입액은 1,032,797원입니다." },
    ]);
    const result = applyGeneratedFactualClaimInventory({
      document: original, drafts: [], decisions: [], fallbackTitle: original.title,
    });
    expect(result.record.removedClaimCount).toBeGreaterThan(0);
  });
});
