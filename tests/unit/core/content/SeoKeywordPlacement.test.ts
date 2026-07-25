import { describe, expect, it } from "vitest";

import { ensureSeoKeywordPlacement, type ContentDocument } from "../../../../core/content";

const keyword = "장내 마이크로바이옴 정신 건강";

function createDocument(): ContentDocument {
  return {
    id: "content-1",
    title: "장-뇌 축이 정신건강에 미치는 영향",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-18T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 5,
      source: "test",
      updatedAt: "2026-07-18T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      metaDescription: "장과 뇌가 연결되는 원리와 생활 관리 기준을 설명합니다.",
    },
    blocks: [
      { id: "intro", type: "paragraph", text: "장과 뇌는 신경과 면역 신호를 통해 서로 영향을 주고받습니다." },
      { id: "heading", type: "heading", level: 2, text: "장-뇌 축의 기본 원리" },
      { id: "link", type: "button", purpose: "internal_link", label: "관련 글", targetUrl: "https://example.com/post", target: "_self" },
    ],
  };
}

describe("ensureSeoKeywordPlacement", () => {
  it("preserves structured long-form boundary metadata while refreshing SEO metadata", () => {
    const source = createDocument();
    const longFormStructure = {
      introductionBlockIds: ["paragraph-1"],
      sections: [{ headingBlockId: "heading-1", paragraphBlockIds: ["paragraph-2"] }],
      conclusionBlockIds: ["paragraph-3"],
    };
    const sourceWithBoundaries = {
      ...source,
      metadata: { ...source.metadata, longFormStructure },
    } as ContentDocument;

    const result = ensureSeoKeywordPlacement(sourceWithBoundaries, keyword);

    expect(result.metadata?.longFormStructure).toEqual(longFormStructure);
  });

  it("places the exact keyword in title, introduction, and metadata without changing block identity or order", () => {
    const source = createDocument();
    const result = ensureSeoKeywordPlacement(source, keyword);

    expect(result.title).toContain(keyword);
    expect(result.blocks[0].type).toBe("paragraph");
    expect(result.blocks[0].type === "paragraph" ? result.blocks[0].text : "").toContain(keyword);
    expect(result.metadata?.metaDescription).toContain(keyword);
    expect(result.metadata?.metaDescription?.length).toBeGreaterThanOrEqual(60);
    expect(result.metadata?.metaDescription?.length).toBeLessThanOrEqual(180);
    expect(result.blocks.map((block) => block.id)).toEqual(source.blocks.map((block) => block.id));
    expect(result.blocks[2]).toEqual(source.blocks[2]);
  });

  it("reduces a long keyword-list title to one readable colon while preserving the exact keyword", () => {
    const source = {
      ...createDocument(),
      title: "만성 염증 완화 식단: 장내 마이크로바이옴 정신 건강: 식이섬유·프로바이오틱스·프리바이오틱스 실천 가이드",
    };
    const result = ensureSeoKeywordPlacement(source, keyword);

    expect(result.title).toBe("장내 마이크로바이옴 정신 건강: 만성 염증 완화 식단 가이드");
    expect(result.title.length).toBeLessThanOrEqual(68);
    expect(result.title.match(/:/gu)).toHaveLength(1);
    expect(result.title.match(/[·,/]/gu) ?? []).toHaveLength(0);
  });

  it("corrects the current fatigue article title with the confirmed shift-worker keyword", () => {
    const source = {
      ...createDocument(),
      title: "만성 피로 증후군 이해하기: 지속 피로 원인, 검사, 수면과 생활관리",
    };
    const result = ensureSeoKeywordPlacement(source, "교대근무자 수면 관리법");

    expect(result.title).toBe("교대근무자 수면 관리법: 만성 피로 증후군 이해하기");
    expect(result.title).toContain("교대근무자 수면 관리법");
    expect(result.title.length).toBeLessThanOrEqual(68);
  });

  it("corrects the reported inflammation title before it becomes canonical", () => {
    const source = { ...createDocument(), title: "만성 염증 관리 가이드: 음식, 검사 수치와 생활습관" };
    const first = ensureSeoKeywordPlacement(source, "장 건강 관리 방법");
    const repeated = ensureSeoKeywordPlacement(first, "장 건강 관리 방법");

    expect(first.title).toBe("장 건강 관리 방법: 만성 염증 관리 가이드");
    expect(first.title.split("장 건강 관리 방법")).toHaveLength(2);
    expect(repeated).toBe(first);
  });

  it("uses Unicode NFKC and repeated-whitespace normalization for exact phrase placement", () => {
    const source = { ...createDocument(), title: "ＡＩ   콘텐츠 전략: 실전 가이드" };
    const result = ensureSeoKeywordPlacement(source, "AI 콘텐츠 전략");

    expect(result.title).toBe("ＡＩ 콘텐츠 전략: 실전 가이드");
  });

  it("removes repeated keyword occurrences while preserving a readable support phrase", () => {
    const source = { ...createDocument(), title: "장 건강 관리 방법: 장 건강 관리 방법 실천 가이드" };
    const result = ensureSeoKeywordPlacement(source, "장 건강 관리 방법");

    expect(result.title).toBe("장 건강 관리 방법: 실천 가이드");
    expect(result.title.split("장 건강 관리 방법")).toHaveLength(2);
  });

  it("does not duplicate an exact keyword that is already placed", () => {
    const source = createDocument();
    const placed = ensureSeoKeywordPlacement(source, keyword);
    const repeated = ensureSeoKeywordPlacement(placed, keyword);

    expect(repeated).toBe(placed);
    expect(repeated.title.split(keyword)).toHaveLength(2);
  });

  it("leaves the document unchanged when no keyword is configured", () => {
    const source = createDocument();
    expect(ensureSeoKeywordPlacement(source, "   ")).toBe(source);
  });
});
