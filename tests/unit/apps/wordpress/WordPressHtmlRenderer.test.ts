import { describe, expect, it } from "vitest";

import { WordPressHtmlRenderer } from "../../../../apps/wordpress/WordPressHtmlRenderer";
import type { ContentDocument } from "../../../../core/content";

function document(): ContentDocument {
  return {
    id: "wordpress-buttons",
    title: "버튼 렌더링 확인",
    metadata: {
      buttonCount: 4,
      createdAt: "2026-08-10T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-10T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 20,
    },
    blocks: [
      { id: "intro", type: "paragraph", text: "본문 문단입니다." },
      { id: "cta", type: "button", purpose: "cta", label: "계속하기", targetUrl: "/next", target: "_self" },
      {
        id: "internal",
        type: "button",
        purpose: "internal_link",
        label: "신용카드 명세서 보는 방법",
        targetUrl: "https://bright-money.example.com/credit-card-statement",
        target: "_self",
      },
      { id: "money", type: "button", purpose: "monetization", label: "외부 상품", targetUrl: "https://example.com/product", target: "_blank" },
      { id: "related-1", type: "button", purpose: "related_post", label: "관련 글 1", targetUrl: "https://bright-money.example.com/entry/one", target: "_self" },
    ],
  };
}

describe("WordPress button rendering", () => {
  it("renders internal_link buttons as a distinct highlighted card, not a generic Gutenberg button", () => {
    const html = new WordPressHtmlRenderer().render(document());

    expect(html).toContain('<aside class="bright-internal-link"');
    expect(html).toContain("함께 읽으면 좋은 글");
    expect(html).toContain('href="https://bright-money.example.com/credit-card-statement"');
    expect(html).toContain("신용카드 명세서 보는 방법 →");
    expect(html).not.toContain('<div class="wp-block-button"><a class="wp-block-button__link" href="https://bright-money.example.com/credit-card-statement"');
  });

  it("keeps other button purposes rendered as native Gutenberg buttons", () => {
    const html = new WordPressHtmlRenderer().render(document());

    expect(html).toContain('<div class="wp-block-button"><a class="wp-block-button__link" href="/next">계속하기</a></div>');
    expect(html).toContain('<div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com/product" target="_blank" rel="noopener noreferrer">외부 상품</a></div>');
  });

  it("still places related_post buttons in the separate 관련 글 보기 section", () => {
    const html = new WordPressHtmlRenderer().render(document());

    expect(html).toContain('<section class="bright-related-posts"><h2>관련 글 보기</h2>');
    expect(html).toContain('<li><a href="https://bright-money.example.com/entry/one">관련 글 1</a></li>');
  });
});
