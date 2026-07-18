import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { TistoryHtmlRenderer } from "../../../../apps/tistory/publishing/TistoryHtmlRenderer";

function document(): ContentDocument {
  return {
    id: "links",
    title: "링크 표시 테스트",
    blocks: [
      { id: "intro", type: "paragraph", text: "본문 도입입니다." },
      { id: "internal", type: "button", purpose: "internal_link", label: "중간 내부링크", targetUrl: "https://bright-healthy.tistory.com/entry/internal", target: "_self" },
      { id: "heading", type: "heading", level: 2, text: "본문 제목" },
      { id: "related-1", type: "button", purpose: "related_post", label: "관련 글 하나", targetUrl: "https://bright-healthy.tistory.com/entry/related-1", target: "_self" },
      { id: "related-2", type: "button", purpose: "related_post", label: "관련 글 둘", targetUrl: "https://bright-healthy.tistory.com/entry/related-2", target: "_self" },
      { id: "related-3", type: "button", purpose: "related_post", label: "관련 글 셋", targetUrl: "https://bright-healthy.tistory.com/entry/related-3", target: "_self" },
    ],
  };
}

describe("Tistory related-link presentation", () => {
  it("renders the final related-post heading as 함께 보면 좋은 글", () => {
    const html = new TistoryHtmlRenderer().render(document());

    expect(html).toContain('<section class="bright-related-posts"><h2>함께 보면 좋은 글</h2>');
    expect(html).not.toContain("<h2>관련 글 보기</h2>");
  });

  it("renders the contextual internal link as a visible background card", () => {
    const html = new TistoryHtmlRenderer().render(document());

    expect(html).toContain('<aside class="bright-internal_link"');
    expect(html).toContain("background:#f3f7ff");
    expect(html).toContain("border:1px solid #cfe0ff");
    expect(html).toContain("함께 읽으면 좋은 글");
    expect(html).toContain('href="https://bright-healthy.tistory.com/entry/internal"');
    expect(html).toContain("중간 내부링크 →");
  });
});
