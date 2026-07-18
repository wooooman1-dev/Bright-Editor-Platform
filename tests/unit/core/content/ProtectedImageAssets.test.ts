import { describe, expect, it } from "vitest";

import { restoreProtectedImageAssets, type ContentDocument } from "../../../../core/content";

const original: ContentDocument = Object.freeze({
  id: "content-1",
  title: "원본",
  blocks: Object.freeze([
    { id: "heading-1", type: "heading", level: 2, text: "첫 번째" },
    {
      id: "image-1",
      type: "image",
      source: "/api/media/image-1.png",
      alt: "원본 ALT",
      assetId: "asset-1",
      fileName: "image-1.png",
      mimeType: "image/png",
      prompt: "원본 프롬프트",
      purpose: "inline",
      sourceType: "ai_generated",
    },
    { id: "paragraph-1", type: "paragraph", text: "본문" },
  ]),
});

describe("restoreProtectedImageAssets", () => {
  it("restores protected media fields when AI rewrites the same image block", () => {
    const candidate: ContentDocument = {
      ...original,
      title: "수정본",
      blocks: [
        { id: "heading-1", type: "heading", level: 2, text: "수정된 첫 번째" },
        { id: "image-1", type: "image", source: "", alt: "수정 ALT" },
        { id: "paragraph-1", type: "paragraph", text: "수정 본문" },
      ],
    };

    const restored = restoreProtectedImageAssets(original, candidate);
    const image = restored.blocks.find((block) => block.id === "image-1");

    expect(image).toMatchObject({
      assetId: "asset-1",
      fileName: "image-1.png",
      mimeType: "image/png",
      prompt: "원본 프롬프트",
      purpose: "inline",
      source: "/api/media/image-1.png",
      sourceType: "ai_generated",
      alt: "수정 ALT",
    });
  });

  it("reinserts an attached image when AI omits it", () => {
    const candidate: ContentDocument = {
      ...original,
      blocks: [
        { id: "heading-1", type: "heading", level: 2, text: "수정된 첫 번째" },
        { id: "paragraph-1", type: "paragraph", text: "수정 본문" },
      ],
    };

    const restored = restoreProtectedImageAssets(original, candidate);
    expect(restored.blocks.map((block) => block.id)).toEqual(["heading-1", "image-1", "paragraph-1"]);
  });

  it("does not force source-empty recommendations back into a candidate", () => {
    const planned: ContentDocument = {
      ...original,
      blocks: [{ id: "image-planned", type: "image", source: "", alt: "추천", prompt: "추천 프롬프트", sourceType: "planned" }],
    };
    const candidate: ContentDocument = { ...planned, blocks: [] };
    expect(restoreProtectedImageAssets(planned, candidate).blocks).toEqual([]);
  });
});
