import { describe, expect, it } from "vitest";

import { deriveContentTags, type ContentDocument } from "../../../../core/content";

function document(): ContentDocument {
  return {
    id: "content-tags",
    title: "장내 마이크로바이옴과 정신건강: 만성 염증 완화 식단 가이드",
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
      secondaryKeywords: ["만성 염증", "식이섬유", "프로바이오틱스", "프리바이오틱스"],
      relatedTerms: ["장 건강", "정신 건강", "장-뇌 축"],
    },
    blocks: [
      { id: "intro", type: "paragraph", text: "장과 뇌의 연결을 설명합니다." },
      { id: "h2", type: "heading", level: 2, text: "장내 미생물과 식단 관리 방법" },
    ],
  };
}

describe("deriveContentTags", () => {
  it("creates compact, deduplicated Tistory-ready tags with the primary topic first", () => {
    const tags = deriveContentTags(document(), "장내 마이크로바이옴·장-뇌 축이 정신건강에 미치는 영향");

    expect(tags.length).toBeGreaterThanOrEqual(6);
    expect(tags.length).toBeLessThanOrEqual(8);
    expect(tags).toContain("장내마이크로바이옴");
    expect(tags).toContain("정신건강");
    expect(tags).toContain("만성염증");
    expect(tags).toContain("식이섬유");
    expect(tags.every((tag) => !tag.includes("#") && !/\s/u.test(tag))).toBe(true);
    expect(new Set(tags.map((tag) => tag.toLocaleLowerCase("ko-KR"))).size).toBe(tags.length);
  });

  it("respects the configured maximum and ignores generic guide terms", () => {
    const tags = deriveContentTags(document(), "건강 관리 가이드", 5);

    expect(tags).toHaveLength(5);
    expect(tags).not.toContain("가이드");
    expect(tags).not.toContain("방법");
  });
});
