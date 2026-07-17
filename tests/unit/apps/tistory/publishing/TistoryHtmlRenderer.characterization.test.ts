import { describe, expect, it } from "vitest";

import { TistoryHtmlRenderer } from "../../../../../apps/tistory/publishing/TistoryHtmlRenderer";
import type { ContentDocument } from "../../../../../core/content";

const document: ContentDocument = {
  id: "content-characterization",
  title: "Renderer baseline",
  blocks: [
    { id: "intro", type: "paragraph", text: "시작 & 안내\n다음 줄" },
    { id: "h2-a", type: "heading", level: 2, text: "같은 제목" },
    { id: "h3-a", type: "heading", level: 3, text: "같은 제목" },
    { id: "image", type: "image", source: "https://cdn.example.com/a\"b.png?x=1&y=2", alt: "A & B <개념>", caption: "설명 & 캡션" },
    { id: "placeholder", type: "image", source: "", alt: "업로드가 필요한 이미지" },
    { id: "video", type: "video", source: "https://www.youtube.com/watch?v=a&b=1" },
    { id: "cta", type: "button", purpose: "cta", label: "계속하기", targetUrl: "/next", target: "_self" },
    { id: "internal", type: "button", purpose: "internal_link", label: "내부 글", targetUrl: "https://bright-health.tistory.com/entry/internal", target: "_self" },
    { id: "money", type: "button", purpose: "monetization", label: "외부 상품", targetUrl: "https://example.com/product?a=1&b=2", target: "_blank" },
    { id: "missing", type: "button", purpose: "cta", label: "주소 필요", targetUrl: "", target: "_self" },
    { id: "related-1", type: "button", purpose: "related_post", label: "관련 글 1", targetUrl: "https://bright-health.tistory.com/entry/one", target: "_self" },
    { id: "related-2", type: "button", purpose: "related_post", label: "관련 글 2", targetUrl: "https://bright-health.tistory.com/entry/two", target: "_blank" },
    { id: "related-3", type: "button", purpose: "related_post", label: "관련 글 3", targetUrl: "https://bright-health.tistory.com/entry/three", target: "_self" },
    { id: "related-4", type: "button", purpose: "related_post", label: "관련 글 4", targetUrl: "https://bright-health.tistory.com/entry/four", target: "_self" },
    { id: "related-manage", type: "button", purpose: "related_post", label: "관리 화면", targetUrl: "https://bright-health.tistory.com/manage/posts", target: "_self" },
    { id: "related-invalid", type: "button", purpose: "related_post", label: "외부 주소", targetUrl: "https://example.com/entry/outside", target: "_self" },
  ],
};

describe("TistoryHtmlRenderer characterization baseline", () => {
  const renderer = new TistoryHtmlRenderer();

  it("is deterministic for the same canonical input", () => {
    expect(renderer.render(document)).toBe(renderer.render(document));
  });

  it("keeps the current heading, table-of-contents, anchor, paragraph, and escaping behavior", () => {
    const html = renderer.render(document);
    expect(html).toContain('class="bright-toc"');
    expect(html).toContain('<a href="#같은-제목">같은 제목</a>');
    expect(html).toContain('<h2 id="같은-제목">같은 제목</h2>');
    expect(html).toContain('<h3 id="같은-제목-2">같은 제목</h3>');
    expect(html).toContain('<p>시작 &amp; 안내<br>다음 줄</p>');
  });

  it("keeps actual images, captions, ALT text, placeholders, and attribute escaping", () => {
    const html = renderer.render(document);
    expect(html).toContain('src="https://cdn.example.com/a&quot;b.png?x=1&amp;y=2"');
    expect(html).toContain('alt="A &amp; B &lt;개념&gt;"');
    expect(html).toContain('<figcaption>설명 &amp; 캡션</figcaption>');
    expect(html).toContain('class="bright-image-placeholder" data-image-required="true"');
    expect(html).toContain('업로드가 필요한 이미지');
  });

  it("keeps the current video, CTA, internal-link, monetization, and missing-link output", () => {
    const html = renderer.render(document);
    expect(html).toContain('<div class="bright-embed"><a href="https://www.youtube.com/watch?v=a&amp;b=1">https://www.youtube.com/watch?v=a&amp;b=1</a></div>');
    expect(html).toContain('<p class="bright-cta"><a href="/next">계속하기</a></p>');
    expect(html).toContain('<p class="bright-internal_link"><a href="https://bright-health.tistory.com/entry/internal">내부 글</a></p>');
    expect(html).toContain('<p class="bright-monetization"><a href="https://example.com/product?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">외부 상품</a></p>');
    expect(html).toContain('<div class="bright-cta bright-link-required"><strong>주소 필요</strong><span>URL 입력 필요</span></div>');
  });

  it("moves only verified Tistory related posts into one final section and limits them to three", () => {
    const html = renderer.render(document);
    const relatedSection = html.slice(html.indexOf('class="bright-related-posts"'));
    expect(relatedSection).toContain("관련 글 1");
    expect(relatedSection).toContain('관련 글 2</a>');
    expect(relatedSection).toContain('target="_blank" rel="noopener noreferrer"');
    expect(relatedSection).toContain("관련 글 3");
    expect(relatedSection).not.toContain("관련 글 4");
    expect(html).not.toContain("관리 화면");
    expect(html).not.toContain("외부 주소");
    expect(html.indexOf('class="bright-related-posts"')).toBeGreaterThan(html.indexOf('class="bright-monetization"'));
  });
});
