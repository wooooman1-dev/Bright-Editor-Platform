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

    expect(html).toContain('<section class="bright-related-posts" style=');
    expect(html).toContain(">관련 글 보기</h2>");
    expect(html).toContain('href="https://bright-money.example.com/entry/one"');
    expect(html).toContain("관련 글 1</a></li>");
  });
});

function sourceDocument(): ContentDocument {
  return {
    ...document(),
    id: "wordpress-sources",
    blocks: [
      { id: "intro", type: "paragraph", text: "본문 문단입니다." },
      { id: "cta", type: "button", purpose: "cta", label: "계속하기", targetUrl: "/next", target: "_self" },
      { id: "sources-heading", type: "heading", level: 2, text: "출처", ownership: "system_source_projection" },
      { id: "source-1", type: "button", purpose: "source", label: "청년내일저축계좌 신청 방법 · korea.kr", targetUrl: "https://www.korea.kr/news/one", target: "_blank", ownership: "system_source_projection" },
      { id: "source-2", type: "button", purpose: "source", label: "자산형성지원사업 · 보건복지부", targetUrl: "https://www.mohw.go.kr/asset", target: "_blank", ownership: "system_source_projection" },
      { id: "reviewed-at", type: "paragraph", text: "출처 확인일: 2026-08-19", ownership: "system_source_projection" },
    ],
  };
}

describe("WordPress source link rendering", () => {
  it("renders consecutive source links as one list instead of theme-coloured Gutenberg buttons", () => {
    const html = new WordPressHtmlRenderer().render(sourceDocument());

    expect(html).toContain('<ul class="bright-sources"><li><a href="https://www.korea.kr/news/one" target="_blank" rel="noopener noreferrer">청년내일저축계좌 신청 방법 · korea.kr</a></li><li><a href="https://www.mohw.go.kr/asset" target="_blank" rel="noopener noreferrer">자산형성지원사업 · 보건복지부</a></li></ul>');
    expect(html).not.toContain('wp-block-button__link" href="https://www.korea.kr/news/one"');
    expect(html).not.toContain('wp-block-button__link" href="https://www.mohw.go.kr/asset"');
  });

  it("keeps the 출처 heading and the review date outside the list", () => {
    const html = new WordPressHtmlRenderer().render(sourceDocument());

    expect(html).toContain(">출처</h2>");
    expect(html).toContain("<p>출처 확인일: 2026-08-19</p>");
  });

  it("leaves CTA buttons as native Gutenberg buttons in the same document", () => {
    const html = new WordPressHtmlRenderer().render(sourceDocument());

    expect(html).toContain('<div class="wp-block-button"><a class="wp-block-button__link" href="/next">계속하기</a></div>');
  });
});

function tocDocument(): ContentDocument {
  return {
    ...document(),
    id: "wordpress-toc",
    blocks: [
      { id: "intro", type: "paragraph", text: "본문 문단입니다." },
      { id: "h2-1", type: "heading", level: 2, text: "첫 번째 확인 항목" },
      { id: "p1", type: "paragraph", text: "첫 번째 섹션 본문입니다." },
      { id: "h2-2", type: "heading", level: 2, text: "두 번째 확인 항목" },
      { id: "p2", type: "paragraph", text: "두 번째 섹션 본문입니다." },
    ],
  };
}

describe("WordPress table of contents rendering", () => {
  it("labels the table of contents with the same heading level as the other appended sections", () => {
    const html = new WordPressHtmlRenderer().render(tocDocument());

    expect(html).toContain('<nav class="bright-toc" aria-label="목차" style=');
    expect(html).toContain(">목차</h2>");
    expect(html).not.toContain("<strong>목차</strong>");
  });

  it("separates the table of contents from body prose with its own box", () => {
    const html = new WordPressHtmlRenderer().render(tocDocument());
    const nav = /<nav class="bright-toc"[^>]*style="([^"]*)"/u.exec(html)?.[1] ?? "";

    expect(nav).toContain("background:#f7f8fa");
    expect(nav).toContain("border:1px solid #dcdfe4");
  });

  it("gives 관련 글 보기 the same blue family as the in-body internal link card", () => {
    const html = new WordPressHtmlRenderer().render(document());
    const section = /<section class="bright-related-posts"[^>]*style="([^"]*)"/u.exec(html)?.[1] ?? "";

    expect(section).toContain("background:#f3f7ff");
    expect(section).toContain("border:1px solid #cfe0ff");
    expect(html).toContain('<a href="https://bright-money.example.com/entry/one" style="color:#1456c0');
  });
});
