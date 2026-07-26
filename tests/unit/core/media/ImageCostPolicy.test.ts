import { describe, expect, it } from "vitest";

import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../../../../core/content";
import {
  applyGeneratedImageCostPolicy,
  findReusableProjectImage,
  generatedImageCountForContent,
  isBrightComponentPurpose,
  isProjectImageReusableForBlock,
  selectAutomaticImageBlock,
  type MediaAsset,
  type ProjectMediaAsset,
} from "../../../../core/media";

describe("ImageCostPolicy", () => {
  it("treats every zero-cost Bright card purpose, including infographic, as an explicit replacement target", () => {
    expect(["comparison", "checklist", "infographic", "summary", "warning"].every((purpose) => isBrightComponentPurpose(purpose as ImageBlockPurpose))).toBe(true);
    expect(isBrightComponentPurpose("inline")).toBe(false);
    expect(isBrightComponentPurpose("hero")).toBe(false);
  });

  it("selects only one source-empty hero block for automatic paid generation", () => {
    const document = imageDocument([
      planned("inline", "inline", "본문 운동 자세"),
      planned("hero", "hero", "운동 비교 대표"),
      planned("infographic", "infographic", "운동 순서 인포그래픽"),
    ]);

    expect(selectAutomaticImageBlock(document)?.id).toBe("hero");
    expect(selectAutomaticImageBlock(imageDocument([
      planned("inline", "inline", "본문 운동 자세"),
    ]))).toBeUndefined();
  });

  it("keeps only the planned hero while preserving already connected body images", () => {
    const placedComparison: ImageBlock = {
      id: "placed-comparison",
      type: "image",
      source: "/api/media/existing.png",
      alt: "기존 비교 이미지",
      purpose: "comparison",
      sourceType: "upload",
    };
    const document = imageDocument([
      planned("hero", "hero", "대표 장면"),
      planned("inline", "inline", "본문 장면"),
      planned("comparison", "comparison", "비교 카드"),
      planned("checklist", "checklist", "체크리스트 카드"),
      placedComparison,
    ]);

    const result = applyGeneratedImageCostPolicy(document);

    expect(result.blocks.map((block) => block.id)).toEqual([
      "hero",
      "placed-comparison",
    ]);
    expect(selectAutomaticImageBlock(result)?.id).toBe("hero");
  });

  it("allows explicit reuse of an unsent hero but never selects it automatically", () => {
    const hero = planned("hero", "hero", "근력운동과 유산소운동 비교 대표 이미지");
    const unusedHero = projectAsset({
      id: "unused-hero",
      alt: "근력운동 유산소운동 비교 대표 이미지",
      prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
      purpose: "hero",
      references: [{ blockId: "old-hero", contentId: "old", contentTitle: "미전송 글", purpose: "hero", sentToDraft: false, updatedAt: "2026-07-25T00:00:00.000Z" }],
    });
    const sentHero = projectAsset({
      id: "sent-hero",
      alt: "근력운동 유산소운동 비교 대표 이미지",
      prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
      purpose: "hero",
      references: [{ blockId: "sent-hero", contentId: "sent", contentTitle: "임시저장 글", purpose: "hero", sentToDraft: true, updatedAt: "2026-07-25T01:00:00.000Z" }],
    });

    expect(isProjectImageReusableForBlock(unusedHero, hero)).toBe(true);
    expect(isProjectImageReusableForBlock(sentHero, hero)).toBe(false);
    expect(findReusableProjectImage([unusedHero], hero)).toBeUndefined();
  });

  it("reuses suitable body media but excludes anything used as a hero", () => {
    const target = planned("inline", "inline", "근력운동과 유산소운동 차이 본문 이미지");
    const suitable = projectAsset({
      id: "suitable",
      alt: "근력운동 유산소운동 차이 본문 이미지",
      prompt: "근력운동과 유산소운동을 비교하는 본문 장면",
      purpose: "inline",
    });
    const usedAsHero = projectAsset({
      id: "hero-history",
      alt: "근력운동 유산소운동 차이 본문 이미지",
      prompt: "근력운동과 유산소운동을 비교하는 본문 장면",
      purpose: "inline",
      references: [{ blockId: "old-hero", contentId: "old", contentTitle: "이전 글", purpose: "hero", updatedAt: "2026-07-25T00:00:00.000Z" }],
    });

    expect(isProjectImageReusableForBlock(suitable, target)).toBe(true);
    expect(isProjectImageReusableForBlock(usedAsHero, target)).toBe(false);
    expect(findReusableProjectImage([usedAsHero, suitable], target)?.id).toBe("suitable");
  });

  it("counts only AI-generated assets belonging to the same content", () => {
    const assets: MediaAsset[] = [
      mediaAsset("generated-current", "current", "ai_generated"),
      mediaAsset("uploaded-current", "current", "upload"),
      mediaAsset("generated-other", "other", "ai_generated"),
    ];

    expect(generatedImageCountForContent(assets, "current")).toBe(1);
  });
});

function imageDocument(blocks: readonly ImageBlock[]): ContentDocument {
  return { id: "document", title: "이미지 정책", blocks };
}

function planned(id: string, purpose: NonNullable<ImageBlock["purpose"]>, alt: string): ImageBlock {
  return {
    id,
    type: "image",
    source: "",
    sourceType: "planned",
    purpose,
    alt,
    prompt: `${alt}를 구체적으로 표현`,
  };
}

function projectAsset(input: Readonly<{
  id: string;
  alt: string;
  prompt: string;
  purpose: ImageBlockPurpose;
  references?: ProjectMediaAsset["references"];
}>): ProjectMediaAsset {
  const references = input.references ?? [];
  return {
    id: input.id,
    kind: "image",
    source: `/api/media/${input.id}.png`,
    metadata: {
      alt: input.alt,
      prompt: input.prompt,
      purpose: input.purpose,
      projectId: "project",
      sourceType: "ai_generated",
      createdAt: "2026-07-26T00:00:00.000Z",
    },
    referenceCount: references.length,
    references,
  };
}

function mediaAsset(id: string, contentId: string, sourceType: "upload" | "ai_generated"): MediaAsset {
  return {
    id,
    kind: "image",
    source: `/api/media/${id}.png`,
    metadata: {
      contentId,
      sourceType,
      createdAt: "2026-07-26T00:00:00.000Z",
    },
  };
}
