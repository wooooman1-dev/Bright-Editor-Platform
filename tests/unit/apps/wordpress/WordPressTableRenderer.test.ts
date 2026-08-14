import { describe, expect, it } from "vitest";

import { WordPressHtmlRenderer } from "../../../../apps/wordpress/WordPressHtmlRenderer";
import type { ContentDocument } from "../../../../core/content";

describe("WordPress table rendering", () => {
  it("keeps semantic table markup and visible cell styling in Preview and Draft HTML", () => {
    const document: ContentDocument = {
      id: "table-1",
      title: "예금자보호 비교",
      blocks: [{
        id: "comparison-table",
        type: "table",
        caption: "보호 여부 확인표",
        headers: ["항목", "확인 방법"],
        rows: [["보호 대상", "상품설명서 확인"]],
      }],
    };

    const html = new WordPressHtmlRenderer().render(document);

    expect(html).toContain('<figure class="wp-block-table"');
    expect(html).toContain("<table style=\"width:100%;border-collapse:collapse");
    expect(html).toContain('<th scope="col" style="border:1px solid #dcdcde');
    expect(html).toContain('<td style="border:1px solid #dcdcde');
    expect(html).toContain("<figcaption");
    expect(html).toContain("overflow-x:auto");
    // 워드프레스는 본문 inline style 에서 overflow-x 를 지우고 min-width 는 남긴다.
    // 스크롤 컨테이너가 사라지는 곳에서 표에 min-width 를 실으면 본문 칸을 뚫고
    // 나간다 — 2026-08-14 발행분에서 960px 표가 720px 칸을 넘었다.
    expect(html).not.toContain("min-width:480px");
    expect(html).toMatch(/<table style="width:100%;[^"]*table-layout:auto/);
  });

  it("renders normalized lists semantically and omits source-empty image plans", () => {
    const document: ContentDocument = {
      id: "list-1",
      title: "가입 전 순서",
      blocks: [
        { id: "steps", type: "paragraph", text: "1. 설명서를 확인합니다.\n2. 한도를 확인합니다." },
        { id: "image-plan", type: "image", source: "", alt: "계산 예시", purpose: "hero" },
      ],
    };

    const html = new WordPressHtmlRenderer().render(document);

    expect(html).toContain("<ol><li>설명서를 확인합니다.</li><li>한도를 확인합니다.</li></ol>");
    expect(html).not.toContain("<p>1.");
    expect(html).not.toContain("<!-- image:");
    expect(html).not.toContain("계산 예시");
  });
});
