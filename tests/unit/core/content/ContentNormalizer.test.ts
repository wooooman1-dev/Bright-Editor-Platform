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
