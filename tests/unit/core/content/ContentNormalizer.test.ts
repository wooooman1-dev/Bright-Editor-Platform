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

  it("splits overlong prose into readable paragraphs and keeps long-form structure aligned", () => {
    const text = [
      "첫 번째 판단 기준을 설명합니다.",
      "두 번째 조건을 구분합니다.",
      "세 번째 확인 순서를 안내합니다.",
      "네 번째 예외를 설명합니다.",
      "다섯 번째 행동을 제시합니다.",
      "여섯 번째 주의점을 정리합니다.",
      "일곱 번째 다음 단계를 안내합니다.",
    ].join(" ");
    const document = {
      id: "document",
      title: "Title",
      metadata: {
        longFormStructure: {
          introductionBlockIds: [],
          sections: [{ headingBlockId: "heading", paragraphBlockIds: ["paragraph"], sectionType: "explanation" }],
          conclusionBlockIds: [],
        },
      },
      blocks: [
        { id: "heading", level: 2, text: "판단 기준", type: "heading" },
        { id: "paragraph", text, type: "paragraph" },
      ],
    } as ContentDocument;

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks.filter((block) => block.type === "paragraph")).toHaveLength(2);
    expect(result.blocks.map((block) => block.id)).toEqual(["heading", "paragraph", "paragraph-part-2"]);
    expect(result.metadata?.longFormStructure?.sections[0]?.paragraphBlockIds).toEqual(["paragraph", "paragraph-part-2"]);
  });

  it("keeps structured list paragraphs intact", () => {
    const text = [
      "1. 첫 번째 항목입니다.",
      "2. 두 번째 항목입니다.",
      "3. 세 번째 항목입니다.",
      "4. 네 번째 항목입니다.",
      "5. 다섯 번째 항목입니다.",
      "6. 여섯 번째 항목입니다.",
      "7. 일곱 번째 항목입니다.",
    ].join("\n");
    const document: ContentDocument = { id: "document", title: "Title", blocks: [{ id: "list", text, type: "paragraph" }] };

    const result = new ContentNormalizer().normalize(document);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ id: "list", text });
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
