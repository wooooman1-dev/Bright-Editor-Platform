import { describe, expect, it } from "vitest";

import { restoreProtectedHeroImage, restoreProtectedImageAssets, type ContentDocument } from "../../../../core/content";

const original = Object.freeze({
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
} satisfies ContentDocument);

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
      alt: "원본 ALT",
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

  it("reinserts an existing source-empty recommendation when AI omits the block", () => {
    const planned: ContentDocument = {
      ...original,
      blocks: [{ id: "image-planned", type: "image", source: "", alt: "추천", prompt: "추천 프롬프트", sourceType: "planned" }],
    };
    const candidate: ContentDocument = { ...planned, blocks: [] };
    expect(restoreProtectedImageAssets(planned, candidate).blocks).toEqual(planned.blocks);
  });

  it("allows AI to improve a source-empty recommendation when the block remains", () => {
    const planned: ContentDocument = {
      ...original,
      blocks: [{ id: "image-planned", type: "image", source: "", alt: "추천", prompt: "기존 프롬프트", sourceType: "planned", purpose: "inline" }],
    };
    const candidate: ContentDocument = {
      ...planned,
      blocks: [{ id: "image-planned", type: "image", source: "", alt: "개선 ALT", prompt: "개선 프롬프트", sourceType: "planned", purpose: "inline" }],
    };
    expect(restoreProtectedImageAssets(planned, candidate).blocks[0]).toMatchObject({ alt: "개선 ALT", prompt: "개선 프롬프트" });
  });

  it("protects an attached external image and the user's ALT and prompt", () => {
    const external: ContentDocument = {
      id: "external",
      title: "외부 이미지",
      blocks: [{ id: "external-image", type: "image", source: "https://images.example.com/photo.jpg", sourceType: "external", alt: "사용자 ALT", prompt: "사용자 프롬프트", purpose: "hero" }],
    };
    const candidate: ContentDocument = {
      ...external,
      blocks: [{ id: "external-image", type: "image", source: "", alt: "AI ALT", prompt: "AI 프롬프트", purpose: "inline" }],
    };

    expect(restoreProtectedImageAssets(external, candidate).blocks[0]).toEqual(external.blocks[0]);
  });
});

/**
 * 2026-09-04 실측: generate 액션의 첫 생성 결과는 이미지 블록에 id가 없어
 * (모델이 안 준다) parseBlock이 위치 기반 id(block-N)를 새로 붙인다. 이전
 * 원고의 대표 이미지 id(hero-image)와 절대 일치하지 않으므로, id로 짝짓는
 * restoreProtectedImageAssets를 그대로 쓰면 원본 hero가 후보 목록에 그대로
 * 추가되어 대표 이미지가 두 장이 된다. restoreProtectedHeroImage는 id가
 * 아니라 역할(purpose: hero)로 짝짓는다.
 */
describe("restoreProtectedHeroImage", () => {
  const paidHero: ContentDocument = {
    id: "content-1",
    title: "원본",
    blocks: [
      { id: "hero-image", type: "image", source: "/api/media/hero-1.png", alt: "돈 주고 만든 대표 이미지", assetId: "asset-hero", purpose: "hero", sourceType: "ai_generated" },
    ],
  };

  it("merges the paid hero onto the freshly generated hero without adding a duplicate block", () => {
    const freshCandidate: ContentDocument = {
      id: "content-1",
      title: "다시 생성된 원고",
      blocks: [
        { id: "block-1", type: "image", source: "", alt: "새 생성이 만든 ALT", purpose: "hero" },
        { id: "block-2", type: "paragraph", text: "본문" },
      ],
    };

    const restored = restoreProtectedHeroImage(paidHero, freshCandidate);
    const images = restored.blocks.filter((block) => block.type === "image");

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: "block-1",
      source: "/api/media/hero-1.png",
      assetId: "asset-hero",
      purpose: "hero",
      alt: "돈 주고 만든 대표 이미지",
    });
  });

  it("leaves the candidate untouched when the original has no attached hero", () => {
    const noHero: ContentDocument = { id: "content-1", title: "원본", blocks: [] };
    const candidate: ContentDocument = { id: "content-1", title: "새 생성", blocks: [{ id: "block-1", type: "image", source: "", alt: "새 ALT", purpose: "hero" }] };
    expect(restoreProtectedHeroImage(noHero, candidate)).toBe(candidate);
  });

  it("leaves the candidate untouched when the candidate has no hero block", () => {
    const candidate: ContentDocument = { id: "content-1", title: "새 생성", blocks: [{ id: "block-1", type: "paragraph", text: "본문" }] };
    expect(restoreProtectedHeroImage(paidHero, candidate)).toBe(candidate);
  });
});
