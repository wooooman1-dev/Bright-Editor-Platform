import { describe, expect, it } from "vitest";

import { TistoryHtmlRenderer } from "../../../apps/tistory/publishing/TistoryHtmlRenderer";
import { WordPressHtmlRenderer } from "../../../apps/wordpress/WordPressHtmlRenderer";
import type { ContentDocument } from "../../../core/content";

const renderers = [
  ["WordPress", () => new WordPressHtmlRenderer().render(document())],
  ["Tistory", () => new TistoryHtmlRenderer().render(document())],
] as const;

describe.each(renderers)("%s semantic content presentation", (_platform, render) => {
  it("mixes standard prose, a checklist card, ordered steps, a comparison table, and a warning card", () => {
    const html = render();

    expect(html.match(/class="bright-content-card /gu)).toHaveLength(2);
    expect(html).toContain('data-bright-component="bright.checklist"');
    expect(html).toContain('data-bright-component="bright.warning"');
    expect(html).toContain("체크리스트");
    expect(html).toContain("주의·확인");
    expect(html).toContain("<ol><li>Open the statement</li><li>Compare the transaction</li></ol>");
    expect(html).toContain("<table");
    expect(html).toContain("Plain explanation remains ordinary body content.");
    expect(html).not.toContain('data-bright-component="bright.summary-card"');
  });

  it("keeps a short first-column label intact and uses a mobile-safe overflow boundary", () => {
    const html = render();

    expect(html).toMatch(/<t[hd][^>]+width:1%;min-width:\d+px;white-space:nowrap;word-break:keep-all;overflow-wrap:normal/gu);
    expect(html).toContain("overflow-x:auto");
    expect(html).toContain("max-width:100%");
  });

  it("does not mutate canonical factual text or its block identity", () => {
    const source = document();
    const before = JSON.stringify(source);
    const html = _platform === "WordPress"
      ? new WordPressHtmlRenderer().render(source)
      : new TistoryHtmlRenderer().render(source);

    expect(html).toContain("A cancellation request and billing reflection may be separate stages.");
    expect(JSON.stringify(source)).toBe(before);
    expect(source.blocks.find((block) => block.id === "warning-copy")).toMatchObject({ id: "warning-copy" });
  });
});

function document(): ContentDocument {
  return {
    id: "mixed-presentation",
    title: "Readable statement guide",
    blocks: [
      { id: "intro", type: "paragraph", text: "Introduction." },
      { id: "explanation-heading", type: "heading", level: 2, text: "Understand the statement" },
      { id: "explanation-copy", type: "paragraph", text: "Plain explanation remains ordinary body content." },
      { id: "checklist-heading", type: "heading", level: 2, text: "What to check" },
      { id: "checklist-items", type: "list", style: "unordered", items: ["Approved amount", "Cancellation status"] },
      { id: "steps-heading", type: "heading", level: 2, text: "Check in order" },
      { id: "steps-list", type: "list", style: "ordered", items: ["Open the statement", "Compare the transaction"] },
      { id: "comparison-heading", type: "heading", level: 2, text: "Compare payment states" },
      { id: "comparison-table", type: "table", headers: ["확인 기준", "설명"], rows: [["결제 방식", "Compare the displayed state."]] },
      { id: "warning-heading", type: "heading", level: 2, text: "Confirm before deciding" },
      { id: "warning-copy", type: "paragraph", text: "A cancellation request and billing reflection may be separate stages." },
      { id: "conclusion", type: "paragraph", text: "Conclusion." },
    ],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-09",
      generator: "fixture",
      imageCount: 0,
      language: "en",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-09",
      version: 1,
      videoCount: 0,
      wordCount: 50,
      longFormStructure: {
        introductionBlockIds: ["intro"],
        sections: [
          { headingBlockId: "explanation-heading", paragraphBlockIds: ["explanation-copy"], sectionType: "explanation" },
          { headingBlockId: "checklist-heading", paragraphBlockIds: ["checklist-items"], sectionType: "checklist" },
          { headingBlockId: "steps-heading", paragraphBlockIds: ["steps-list"], sectionType: "steps" },
          { headingBlockId: "comparison-heading", paragraphBlockIds: ["comparison-table"], sectionType: "comparison" },
          { headingBlockId: "warning-heading", paragraphBlockIds: ["warning-copy"], sectionType: "warning" },
        ],
        conclusionBlockIds: ["conclusion"],
      },
    },
  };
}
