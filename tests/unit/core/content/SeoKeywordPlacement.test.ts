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
