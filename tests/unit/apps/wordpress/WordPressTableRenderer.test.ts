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
  });
});
