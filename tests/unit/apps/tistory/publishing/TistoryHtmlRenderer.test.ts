import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../../core/content";
import { TistoryHtmlRenderer } from "../../../../../apps/tistory/publishing/TistoryHtmlRenderer";

describe("TistoryHtmlRenderer tables", () => {
  it("recovers a stored Markdown table and renders semantic responsive HTML", () => {
    const document: ContentDocument = {
      id: "draft",
      title: "운동 비교",
      blocks: [{
        id: "comparison",
        type: "paragraph",
        text: "| 비교 기준 | 근력운동 | 유산소운동 |\n|---|---|---|\n| 주된 자극 | 근육 | 심폐 |",
      }],
    };

    const html = new TistoryHtmlRenderer().render(document);

    expect(html).toContain('class="bright-table-scroll"');
    expect(html).toContain("overflow-x:auto");
    expect(html).toContain("<table");
    expect(html).toContain("<thead><tr>");
    expect(html).toContain('<th scope="col"');
    expect(html).toContain("<tbody><tr>");
    expect(html).toContain("<td");
    expect(html).not.toContain("<p>| 비교 기준");
    expect(html).not.toContain("|---|---|---|");
  });

  it("escapes every caption, header, and cell before rendering", () => {
    const document: ContentDocument = {
      id: "draft",
      title: "안전한 표",
      blocks: [{
        id: "table",
        type: "table",
        caption: "A < B",
        headers: ["조건 & 기준", "해석"],
        rows: [["<script>alert(1)</script>", "안전 > 우선"]],
      }],
    };

    const html = new TistoryHtmlRenderer().render(document);

    expect(html).toContain("A &lt; B");
    expect(html).toContain("조건 &amp; 기준");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("안전 &gt; 우선");
    expect(html).not.toContain("<script>");
  });
});
