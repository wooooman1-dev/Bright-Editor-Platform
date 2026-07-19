import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import {
  analyzeImagePrompts,
  collectImagePromptContexts,
  ensureDistinctImagePrompts,
  imagePromptSimilarity,
  normalizeImagePrompt,
} from "../../../../core/media";

describe("ImagePromptStrategy", () => {
  it("rewrites identical prompts from different sections into contextual scenes", () => {
    const result = ensureDistinctImagePrompts(twoSectionDocument(), "중년 아침 운동");
    const prompts = imagePrompts(result);

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("준비 운동과 호흡");
    expect(prompts[1]).toContain("허리 동작과 골반 위치");
    expect(normalizeImagePrompt(prompts[0])).not.toBe(normalizeImagePrompt(prompts[1]));
    expect(imagePromptSimilarity(prompts[0], prompts[1])).toBeLessThan(0.72);
  });

  it("gives hero and inline images different editorial roles, scenes, and compositions", () => {
    const document: ContentDocument = {
      id: "hero-inline",
      title: "중년 아침 운동 가이드",
      blocks: [
        { id: "hero", type: "image", source: "", purpose: "hero", alt: "아침 운동을 시작하는 중년 여성", prompt: "같은 프롬프트" },
        { id: "h2", type: "heading", level: 2, text: "허리 스트레칭 자세" },
        { id: "p", type: "paragraph", text: "무릎을 살짝 굽히고 골반을 중립 위치에 둔 뒤 허리 옆선을 천천히 늘립니다." },
        { id: "inline", type: "image", source: "", purpose: "inline", alt: "허리 스트레칭의 무릎과 골반 위치", prompt: "같은 프롬프트" },
      ],
    };
    const result = ensureDistinctImagePrompts(document, "중년 아침 운동");
    const [hero, inline] = imagePrompts(result);

    expect(hero).toContain("글 전체의 핵심 주제와 대표 상황");
    expect(hero).toContain("넓은 가로 프레임");
    expect(inline).toContain("현재 섹션의 방법이나 원리");
    expect(inline).toContain("교육적인 중간 거리 또는 세부 프레임");
    expect(hero).not.toBe(inline);
  });

  it("uses meaningfully different fallback scenes for multiple images in one section", () => {
    const document: ContentDocument = {
      id: "same-section",
      title: "허리 스트레칭",
      blocks: [
        { id: "h", type: "heading", level: 2, text: "허리 스트레칭 자세" },
        { id: "p", type: "paragraph", text: "무릎을 굽히고 골반을 중립으로 둔 뒤 허리 옆선을 천천히 늘립니다." },
        { id: "image-a", type: "image", source: "", purpose: "inline", alt: "허리 스트레칭 자세", prompt: "같은 장면" },
        { id: "image-b", type: "image", source: "", purpose: "inline", alt: "허리 스트레칭 자세", prompt: "같은 장면" },
      ],
    };
    const [first, second] = imagePrompts(ensureDistinctImagePrompts(document, "허리 스트레칭"));

    expect(first).not.toBe(second);
    expect(imagePromptSimilarity(first, second)).toBeLessThan(0.72);
  });

  it("collects deterministic block order, section paragraphs, and previous image roles", () => {
    const contexts = collectImagePromptContexts(twoSectionDocument(), "중년 아침 운동");

    expect(contexts[0]).toMatchObject({ imageIndex: 0, sectionHeading: "준비 운동과 호흡", primaryKeyword: "중년 아침 운동" });
    expect(contexts[0].primaryParagraph).toContain("어깨를 내리고");
    expect(contexts[1]).toMatchObject({ imageIndex: 1, sectionHeading: "허리 동작과 골반 위치" });
    expect(contexts[1].previousImages).toEqual([expect.objectContaining({ blockId: "image-breath", purpose: "inline" })]);
  });

  it("detects normalized duplicates and highly similar scene prompts", () => {
    expect(normalizeImagePrompt("밝은 거실, 스트레칭! ")).toBe(normalizeImagePrompt("  밝은  거실 스트레칭"));
    expect(imagePromptSimilarity(
      "밝은 거실에서 중년 여성이 허리 스트레칭을 하며 무릎과 골반 위치를 측면 구도로 보여주는 교육용 장면",
      "밝은 거실에서 중년 여성이 허리 스트레칭을 하며 무릎과 골반 위치를 측면 구도로 자세히 보여주는 교육용 이미지",
    )).toBeGreaterThanOrEqual(0.72);
  });

  it("does not confuse a shared visual style with duplicated scenes", () => {
    const commonStyle = "따뜻한 중성 색감의 신뢰감 있는 고품질 editorial 이미지, 텍스트와 로고 없음";
    const first = `밝은 거실에서 전신 준비 운동을 시작하는 넓은 가로 구도. ${commonStyle}`;
    const second = `허리 동작 중 무릎과 골반 위치를 측면 클로즈업으로 설명. ${commonStyle}`;

    expect(imagePromptSimilarity(first, second)).toBeLessThan(0.72);
  });

  it("never rewrites attached images or their media fields", () => {
    const document: ContentDocument = {
      id: "attached",
      title: "연결된 이미지 보호",
      blocks: [
        { id: "h", type: "heading", level: 2, text: "연결된 이미지" },
        { id: "p", type: "paragraph", text: "사용자가 직접 수정하고 연결한 이미지 설명입니다." },
        { id: "a", type: "image", source: "/api/media/a.png", sourceType: "upload", assetId: "asset-a", purpose: "inline", alt: "사용자 ALT", prompt: "사용자가 수정한 프롬프트" },
        { id: "b", type: "image", source: "/api/media/b.png", sourceType: "ai_generated", assetId: "asset-b", purpose: "inline", alt: "두 번째 ALT", prompt: "사용자가 수정한 프롬프트" },
      ],
    };

    expect(ensureDistinctImagePrompts(document, "보호")).toEqual(document);
  });

  it("returns the same prompts for the same canonical input", () => {
    const document = twoSectionDocument();
    expect(ensureDistinctImagePrompts(document, "중년 아침 운동")).toEqual(ensureDistinctImagePrompts(document, "중년 아침 운동"));
  });

  it("reports exact duplication, purpose mismatch, uniform roles, and missing section context", () => {
    const analysis = analyzeImagePrompts(twoSectionDocument(), "중년 아침 운동");
    expect(analysis.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      "duplicate_prompt",
      "section_context_missing",
      "uniform_purpose",
    ]));
  });
});

function twoSectionDocument(): ContentDocument {
  return {
    id: "two-sections",
    title: "중년 아침 운동 가이드",
    blocks: [
      { id: "h-breath", type: "heading", level: 2, text: "준비 운동과 호흡" },
      { id: "p-breath", type: "paragraph", text: "어깨를 내리고 코로 천천히 호흡하면서 전신의 긴장을 확인합니다." },
      { id: "image-breath", type: "image", source: "", sourceType: "planned", purpose: "inline", alt: "호흡과 어깨 준비 자세", prompt: "중년 여성이 거실에서 스트레칭하는 모습" },
      { id: "h-waist", type: "heading", level: 2, text: "허리 동작과 골반 위치" },
      { id: "p-waist", type: "paragraph", text: "무릎을 살짝 굽히고 골반을 중립 위치에 둔 뒤 허리 옆선을 천천히 늘립니다." },
      { id: "image-waist", type: "image", source: "", sourceType: "planned", purpose: "inline", alt: "허리 동작의 무릎과 골반 위치", prompt: "중년 여성이 거실에서 스트레칭하는 모습" },
    ],
  };
}

function imagePrompts(document: ContentDocument): string[] {
  return document.blocks.flatMap((block) => block.type === "image" ? [block.prompt ?? ""] : []);
}
