import { describe, expect, it } from "vitest";

import {
  ContentOptimizer,
  type ContentDocument,
} from "../../../../core/content";

describe("ContentOptimizer", () => {
  it("normalizes whitespace while preserving paragraph boundaries and IDs", () => {
    const document: ContentDocument = {
      blocks: [
        { id: "p1", text: " First   paragraph ", type: "paragraph" },
        { id: "p2", text: " second paragraph ", type: "paragraph" },
        { id: "image", alt: " Image ", source: " image.png ", type: "image" },
        { id: "p3", text: " Third   paragraph ", type: "paragraph" },
        { id: "video", source: " https://example.com/video ", type: "video" },
        { id: "button", label: " Read  more ", targetUrl: " https://example.com ", type: "button" },
      ],
      id: "document",
      title: " Content title ",
    };
    const optimizer = new ContentOptimizer({
      generator: "unit-test",
      language: "en",
      now: () => new Date("2026-07-12T00:00:00.000Z"),
      source: "test",
    });

    const result = optimizer.optimize(document);

    expect(result.title).toBe("Content title");
    expect(result.blocks.slice(0, 4)).toEqual([
      { id: "p1", text: "First paragraph", type: "paragraph" },
      { id: "p2", text: "second paragraph", type: "paragraph" },
      { id: "image", alt: "Image", source: "image.png", type: "image" },
      { id: "p3", text: "Third paragraph", type: "paragraph" },
    ]);
    expect(result.blocks).toHaveLength(6);
    expect(result.metadata).toMatchObject({
      buttonCount: 1,
      createdAt: "2026-07-12T00:00:00.000Z",
      generator: "unit-test",
      imageCount: 1,
      language: "en",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-07-12T00:00:00.000Z",
      version: 1,
      videoCount: 1,
    });
    expect(result.metadata?.wordCount).toBe(11);
    expect(document.blocks).toHaveLength(6);
  });

  it("preserves creation metadata while updating processing statistics", () => {
    const initial = new ContentOptimizer({
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    }).optimize({ blocks: [], id: "document", title: "" });
    const updated = new ContentOptimizer({
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    }).optimize(initial);

    expect(updated.metadata?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.metadata?.updatedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it.each([
    { expected: 0, label: "zero words", wordCount: 0 },
    { expected: 1, label: "one-minute content", wordCount: 200 },
    { expected: 2, label: "content exceeding one minute", wordCount: 201 },
  ])("calculates reading time for $label", ({ expected, wordCount }) => {
    const text = Array.from({ length: wordCount }, () => "word").join(" ");
    const result = new ContentOptimizer({
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    }).optimize({
      blocks: text
        ? [{ id: "paragraph", text, type: "paragraph" }]
        : [],
      id: "document",
      title: "",
    });

    expect(result.metadata?.wordCount).toBe(wordCount);
    expect(result.metadata?.readingTime).toBe(expected);
  });

  it("counts image, video, and button blocks exactly", () => {
    const result = new ContentOptimizer().optimize({
      blocks: [
        { id: "image-1", alt: "One", source: "one.png", type: "image" },
        { id: "image-2", alt: "Two", source: "two.png", type: "image" },
        { id: "video", source: "https://example.com/video", type: "video" },
        { id: "button", label: "Action", targetUrl: "https://example.com", type: "button" },
      ],
      id: "document",
      title: "",
    });

    expect(result.metadata).toMatchObject({
      buttonCount: 1,
      imageCount: 2,
      videoCount: 1,
    });
  });

  it("normalizes table cells, drops empty tables, and counts visible table words", () => {
    const result = new ContentOptimizer({
      now: () => new Date("2026-07-26T00:00:00.000Z"),
    }).optimize({
      id: "document",
      title: "운동 비교",
      blocks: [
        {
          id: "table",
          type: "table",
          caption: " 선택 기준 ",
          headers: [" 비교 기준 ", " 근력 운동 "],
          rows: [[" 주된 목표 ", " 힘과 기능 "]],
        },
        { id: "empty", type: "table", headers: ["항목"], rows: [[""]] },
      ],
    });

    expect(result.blocks).toEqual([{
      id: "table",
      type: "table",
      caption: "선택 기준",
      headers: ["비교 기준", "근력 운동"],
      rows: [["주된 목표", "힘과 기능"]],
    }]);
    expect(result.metadata?.wordCount).toBeGreaterThan(2);
    expect(result.metadata?.imageCount).toBe(0);
  });
});
