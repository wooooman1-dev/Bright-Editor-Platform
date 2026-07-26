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
      blocks: [{ id: "unsupported", type: "unknown-widget" }],
      id: "document",
      title: "Title",
    } as unknown as ContentDocument;

    const result = new DefaultContentValidator().validate(document);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: "UNSUPPORTED_BLOCK_TYPE" });
  });

  it("accepts a normalized canonical table", () => {
    const document: ContentDocument = {
      id: "document",
      title: "비교표",
      blocks: [{
        id: "table",
        type: "table",
        headers: ["비교 기준", "선택 A"],
        rows: [["조건", "설명"]],
      }],
    };

    expect(new DefaultContentValidator().validate(document)).toMatchObject({
      errors: [],
      valid: true,
    });
  });

  it("rejects empty or inconsistent canonical tables", () => {
    const empty: ContentDocument = {
      id: "empty",
      title: "빈 표",
      blocks: [{ id: "empty-table", type: "table", headers: ["항목"], rows: [] }],
    };
    const inconsistent: ContentDocument = {
      id: "inconsistent",
      title: "열 불일치",
      blocks: [{ id: "bad-table", type: "table", headers: ["항목", "내용"], rows: [["한 칸"]] }],
    };

    expect(new DefaultContentValidator().validate(empty).errors).toContainEqual(expect.objectContaining({ code: "INVALID_TABLE" }));
    expect(new DefaultContentValidator().validate(inconsistent).errors).toContainEqual(expect.objectContaining({ code: "INVALID_TABLE" }));
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
