import { describe, expect, it, vi } from "vitest";

import {
  contentBlockTypes,
  type ContentBlock,
  type ContentDocument,
  type ContentRenderer,
  type ContentValidator,
} from "../../../../core/content";

const blocks: readonly ContentBlock[] = [
  { id: "heading-1", level: 2, text: "Overview", type: "heading" },
  { id: "paragraph-1", text: "Platform-independent content.", type: "paragraph" },
  {
    alt: "Architecture overview",
    caption: "Content model",
    id: "image-1",
    source: "assets/architecture.png",
    type: "image",
  },
  { id: "video-1", source: "assets/overview.mp4", type: "video" },
  {
    id: "button-1",
    label: "Learn more",
    targetUrl: "https://example.com",
    type: "button",
  },
];

const document: ContentDocument = {
  blocks,
  id: "document-1",
  title: "Content Foundation",
};

describe("content model", () => {
  it("defines every approved content block type", () => {
    expect(contentBlockTypes).toEqual([
      "heading",
      "paragraph",
      "image",
      "video",
      "button",
    ]);
    expect(document.blocks.map((block) => block.type)).toEqual(
      contentBlockTypes,
    );
  });

  it("represents a document without platform or HTML details", () => {
    expect(document).toEqual({
      blocks,
      id: "document-1",
      title: "Content Foundation",
    });
    expect(document).not.toHaveProperty("html");
    expect(document).not.toHaveProperty("platform");
  });
});

describe("content contracts", () => {
  it("allows renderers to produce platform-independent output types", async () => {
    const render = vi.fn(async (value: ContentDocument) => ({
      blockCount: value.blocks.length,
    }));
    const renderer: ContentRenderer<{ blockCount: number }> = { render };

    await expect(renderer.render(document)).resolves.toEqual({ blockCount: 5 });
    expect(render).toHaveBeenCalledWith(document);
  });

  it("returns structured validation results through the validator contract", () => {
    const validate = vi.fn(() => ({ issues: [], valid: true } as const));
    const validator: ContentValidator = { validate };

    expect(validator.validate(document)).toEqual({ issues: [], valid: true });
    expect(validate).toHaveBeenCalledWith(document);
  });
});
