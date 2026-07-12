import { describe, expect, it } from "vitest";

import {
  DefaultContentValidator,
  type ContentDocument,
} from "../../../../core/content";

describe("ContentValidator", () => {
  it("reports duplicate IDs, invalid video URLs, and warnings without mutation", () => {
    const document: ContentDocument = {
      blocks: [
        { id: "duplicate", level: 2, text: "Section", type: "heading" },
        { id: "duplicate", level: 5, text: "Nested", type: "heading" },
        { id: "image", alt: " ", source: "image.png", type: "image" },
        { id: "video", source: "not-a-url", type: "video" },
      ],
      id: "document",
      title: "Title",
    };
    const snapshot = structuredClone(document);

    const result = new DefaultContentValidator().validate(document);

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual([
      "DUPLICATE_BLOCK_ID",
      "INVALID_VIDEO_URL",
    ]);
    expect(result.warnings.map((issue) => issue.code)).toEqual([
      "INVALID_HEADING_HIERARCHY",
      "MISSING_IMAGE_ALT",
    ]);
    expect(result.infos).toEqual([]);
    expect(document).toEqual(snapshot);
  });

  it("reports unsupported runtime block types", () => {
    const document = {
      blocks: [{ id: "unsupported", type: "table" }],
      id: "document",
      title: "Title",
    } as unknown as ContentDocument;

    const result = new DefaultContentValidator().validate(document);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: "UNSUPPORTED_BLOCK_TYPE" });
  });

  it("accepts supported content with valid video URLs", () => {
    const document: ContentDocument = {
      blocks: [
        { id: "video", source: "https://example.com/video.mp4", type: "video" },
      ],
      id: "document",
      title: "Title",
    };

    expect(new DefaultContentValidator().validate(document)).toMatchObject({
      errors: [],
      valid: true,
      warnings: [],
    });
  });
});
