import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { brightBodyVisualContent, ensureFreeBodyVisuals, renderBrightBodyVisualHtml } from "../../../../core/media";

describe("BrightBodyVisuals", () => {
  it("adds two stable zero-cost body cards to an existing long-form draft with only a hero", () => {
    const first = ensureFreeBodyVisuals(article());
    const second = ensureFreeBodyVisuals(first);
    const visuals = first.blocks.filter((block) => block.type === "image" && block.purpose !== "hero");

    expect(visuals).toHaveLength(2);
    expect(visuals.map((block) => block.id)).toEqual(
      second.blocks
        .filter((block) => block.type === "image" && block.purpose !== "hero")
        .map((block) => block.id),
    );
    expect(visuals.some((block) => block.type === "image" && block.purpose === "warning")).toBe(true);
    expect(visuals.every((block) => block.type === "image" && block.source === "" && block.sourceType === "planned")).toBe(true);
  });

  it("keeps all related posts after a missing final warning card is derived", () => {
    const base = article();
    const firstHeadingIndex = base.blocks.findIndex((block) => block.type === "heading");
    const firstParagraphIndex = base.blocks.findIndex((block, index) => index > firstHeadingIndex && block.type === "paragraph");
    const existingInfographic = { id: "existing-infographic", type: "image" as const, source: "", sourceType: "planned" as const, purpose: "infographic" as const, alt: "운동 목표 핵심 안내", caption: "체력과 목표를 먼저 확인합니다." };
    const blocksWithEarlierCard = [...base.blocks];
    blocksWithEarlierCard.splice(firstParagraphIndex + 1, 0, existingInfographic);
    const withRelated: ContentDocument = {
      ...base,
      blocks: [
        ...blocksWithEarlierCard,
        ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}` })),
      ],
    };
    const result = ensureFreeBodyVisuals(withRelated).blocks;
    expect(result.filter((block) => block.type === "image" && block.purpose !== "hero")).toHaveLength(2);
    expect(result.at(-4)).toMatchObject({ type: "image", purpose: "warning" });
    expect(result.slice(-3).map((block) => block.type === "button" ? block.purpose : block.type)).toEqual(["related_post", "related_post", "related_post"]);
  });

  it("renders escaped HTML instead of a missing-image placeholder", () => {
    const visual = ensureFreeBodyVisuals(article()).blocks.find(
      (block) => block.type === "image" && block.purpose === "warning",
    );
    expect(visual?.type).toBe("image");
    if (!visual || visual.type !== "image") return;

    const candidate = { ...visual, alt: "중단 <신호>" };
    expect(brightBodyVisualContent(candidate).items.length).toBeGreaterThan(0);
    expect(renderBrightBodyVisualHtml(candidate)).toContain("중단 &lt;신호&gt;");
    expect(renderBrightBodyVisualHtml(candidate)).toContain('data-free-visual="true"');
    expect(renderBrightBodyVisualHtml(candidate)).not.toContain("data-image-required");
  });
});

function article(): ContentDocument {
  const prose = "운동 강도는 몸의 반응을 확인하며 조절해야 합니다. 숨이 너무 차면 속도를 낮추고 자세가 무너지면 즉시 쉬어야 합니다. 다음 운동에서는 기록을 참고해 강도를 다시 선택합니다.";
  return {
    id: "content-1",
    title: "운동 강도 가이드",
    blocks: [
      { id: "intro", type: "paragraph", text: prose },
      { id: "hero", type: "image", purpose: "hero", source: "/hero.png", sourceType: "ai_generated", alt: "대표" },
      ...["운동 목표 정하기", "강도 조절 방법", "심박수 활용", "중단해야 하는 위험 신호"].flatMap((heading, index) => [
        { id: `h-${index}`, type: "heading" as const, level: 2 as const, text: heading },
        { id: `p-${index}`, type: "paragraph" as const, text: prose },
      ]),
    ],
  };
}
