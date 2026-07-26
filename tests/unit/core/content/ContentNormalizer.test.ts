import { describe, expect, it } from "vitest";

import {
  ContentNormalizer,
  DefaultContentValidator,
  type ContentDocument,
} from "../../../../core/content";

describe("ContentNormalizer", () => {
  it("preserves block order while removing empty paragraphs and generating IDs", () => {
    const document = {
      blocks: [
        { id: "", text: "First", type: "paragraph" },
        { id: "empty", text: "   ", type: "paragraph" },
        { id: "image", alt: "Image", source: "image.png", type: "image" },
      ],
      id: "document",
      title: "Title",
    } as ContentDocument;

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks).toEqual([
      { id: "paragraph-1", text: "First", type: "paragraph" },
      { id: "image", alt: "Image", source: "image.png", type: "image" },
    ]);
    expect(document.blocks).toHaveLength(3);
  });

  it("safely closes heading hierarchy gaps", () => {
    const document: ContentDocument = {
      blocks: [
        { id: "h1", level: 2, text: "Section", type: "heading" },
        { id: "h2", level: 5, text: "Nested", type: "heading" },
      ],
      id: "document",
      title: "Title",
    };

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks[1]).toMatchObject({ level: 3, type: "heading" });
  });

  it("avoids existing IDs and generates distinct IDs for missing values", () => {
    const document = {
      blocks: [
        { id: "paragraph-1", text: "Existing", type: "paragraph" },
        { id: "", text: "Missing one", type: "paragraph" },
        { id: "", text: "Missing two", type: "paragraph" },
      ],
      id: "document",
      title: "Title",
    } as ContentDocument;

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks.map((block) => block.id)).toEqual([
      "paragraph-1",
      "paragraph-2",
      "paragraph-3",
    ]);
    expect(result.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
  });

  it("preserves duplicate existing IDs for the validator to report", () => {
    const document: ContentDocument = {
      blocks: [
        { id: "duplicate", text: "First", type: "paragraph" },
        { id: "duplicate", text: "Second", type: "paragraph" },
      ],
      id: "document",
      title: "Title",
    };

    const result = new ContentNormalizer().normalize(document);
    const validation = new DefaultContentValidator().validate(result);

    expect(result.blocks.map((block) => block.id)).toEqual([
      "duplicate",
      "duplicate",
    ]);
    expect(validation.errors.map((issue) => issue.code)).toContain(
      "DUPLICATE_BLOCK_ID",
    );
  });

  it("keeps valid heterogeneous blocks in their original order", () => {
    const document: ContentDocument = {
      blocks: [
        { id: "heading", level: 2, text: "Heading", type: "heading" },
        { id: "image", alt: "Image", source: "image.png", type: "image" },
        {
          id: "button",
          label: "Action",
          targetUrl: "https://example.com",
          type: "button",
        },
      ],
      id: "document",
      title: "Title",
    };

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks.map((block) => block.id)).toEqual([
      "heading",
      "image",
      "button",
    ]);
  });

  it("converts a Markdown table paragraph into an ordered canonical table block", () => {
    const document: ContentDocument = {
      id: "document",
      title: "비교표",
      blocks: [{
        id: "comparison",
        type: "paragraph",
        text: "비교 전에 확인합니다.\n\n| 비교 기준 | 근력운동 | 유산소운동 |\n|:---|---:|---|\n| 주된 자극 | 근육 | 심폐 |\n| 시간 | 짧게 | 길게 | 추가 셀 |\n\n표를 보고 선택합니다.",
      }],
    };

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks.map((block) => block.type)).toEqual(["paragraph", "table", "paragraph"]);
    expect(result.blocks[1]).toEqual({
      id: "comparison-table-2",
      type: "table",
      headers: ["비교 기준", "근력운동", "유산소운동", ""],
      rows: [
        ["주된 자극", "근육", "심폐", ""],
        ["시간", "짧게", "길게", "추가 셀"],
      ],
    });
    expect(result.blocks.flatMap((block) => block.type === "paragraph" ? [block.text] : [])).toEqual([
      "비교 전에 확인합니다.",
      "표를 보고 선택합니다.",
    ]);
  });

  it("converts an HTML table and decodes escaped cells", () => {
    const document: ContentDocument = {
      id: "document",
      title: "HTML 표",
      blocks: [{
        id: "html-table",
        type: "paragraph",
        text: "<table><caption>선택 기준</caption><tr><th>조건</th><th>해석</th></tr><tr><td>A &amp; B</td><td>&lt;주의&gt;</td></tr></table>",
      }],
    };

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks).toEqual([{
      id: "html-table",
      type: "table",
      caption: "선택 기준",
      headers: ["조건", "해석"],
      rows: [["A & B", "<주의>"]],
    }]);
  });

  it("remaps long-form structure ids when one paragraph expands into text and table blocks", () => {
    const document: ContentDocument = {
      id: "document",
      title: "구조 복구",
      blocks: [
        { id: "heading", type: "heading", level: 2, text: "비교" },
        { id: "mixed", type: "paragraph", text: "설명 문장입니다.\n\n| 기준 | 선택 |\n|---|---|\n| 상태 | 실행 |" },
      ],
      metadata: {
        buttonCount: 0,
        createdAt: "now",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "now",
        version: 1,
        videoCount: 0,
        wordCount: 1,
        longFormStructure: {
          introductionBlockIds: [],
          sections: [{ headingBlockId: "heading", sectionType: "comparison", paragraphBlockIds: ["mixed"] }],
          conclusionBlockIds: [],
        },
      },
    };

    const result = new ContentNormalizer().normalize(document);

    expect(result.metadata?.longFormStructure?.sections[0].paragraphBlockIds).toEqual([
      "mixed",
      "mixed-table-2",
    ]);
  });

  it("drops empty canonical tables", () => {
    const document: ContentDocument = {
      id: "document",
      title: "빈 표",
      blocks: [{ id: "empty-table", type: "table", headers: ["항목"], rows: [[""]] }],
    };

    expect(new ContentNormalizer().normalize(document).blocks).toEqual([]);
  });

  it("returns the original value instead of throwing for malformed runtime input", () => {
    const malformed = {
      blocks: null,
      id: "document",
      title: "Title",
    } as unknown as ContentDocument;

    expect(() => new ContentNormalizer().normalize(malformed)).not.toThrow();
    expect(new ContentNormalizer().normalize(malformed)).toBe(malformed);
  });
});
