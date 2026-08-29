import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { brightBodyVisualContent, ensureFreeBodyVisuals, renderBrightBodyVisualHtml } from "../../../../core/media";

describe("BrightBodyVisuals", () => {
  it("does not synthesize a body card from editorial paragraphs", () => {
    const first = ensureFreeBodyVisuals(article());
    const second = ensureFreeBodyVisuals(first);
    const visuals = first.blocks.filter((block) => block.type === "image" && block.purpose !== "hero");

    expect(visuals).toHaveLength(0);
    expect(second).toEqual(first);
  });

  it("keeps an explicitly stored card and moves all related posts to the end", () => {
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
    expect(result.filter((block) => block.type === "image" && block.purpose !== "hero")).toEqual([existingInfographic]);
    expect(result.slice(-3).map((block) => block.type === "button" ? block.purpose : block.type)).toEqual(["related_post", "related_post", "related_post"]);
  });

  it("renders escaped HTML instead of a missing-image placeholder", () => {
    const candidate = { id: "warning", type: "image" as const, source: "", purpose: "warning" as const, alt: "중단 <신호>", caption: "호흡 곤란\n흉통" };
    expect(brightBodyVisualContent(candidate).items.length).toBeGreaterThan(0);
    expect(renderBrightBodyVisualHtml(candidate)).toContain("중단 &lt;신호&gt;");
    expect(renderBrightBodyVisualHtml(candidate)).not.toContain('data-free-visual="true"');
    expect(renderBrightBodyVisualHtml(candidate)).not.toContain("data-image-required");
  });

  it("draws a bar chart from the block data and scales to the largest value", () => {
    const html = renderBrightBodyVisualHtml({
      id: "bar", type: "image", source: "", purpose: "comparison",
      alt: "가구 유형별 총소득 기준",
      visual: "bar",
      data: [
        { label: "단독가구", value: 2200, note: "만 원" },
        { label: "맞벌이가구", value: 4400, note: "만 원" },
      ],
    });
    expect(html).toContain("단독가구");
    expect(html).toContain("width:50%");
    expect(html).toContain("width:100%");
  });

  it("splits one whole into labelled proportions", () => {
    const html = renderBrightBodyVisualHtml({
      id: "ratio", type: "image", source: "", purpose: "summary",
      alt: "지출 비중", visual: "ratio",
      data: [{ label: "고정지출", value: 60 }, { label: "변동지출", value: 40 }],
    });
    expect(html).toContain("고정지출 60%");
    expect(html).toContain("변동지출 40%");
  });

  it("numbers an ordered procedure", () => {
    const html = renderBrightBodyVisualHtml({
      id: "steps", type: "image", source: "", purpose: "checklist",
      alt: "신청 순서", visual: "steps",
      data: [{ label: "가구 유형 확인" }, { label: "소득 합산", note: "부부합산" }],
    });
    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
    expect(html).toContain("부부합산");
  });

  /**
   * 모양만 요구하고 자료를 안 보내는 응답이 실제로 온다. 빈 상자를 내보내는 대신
   * 목록으로 떨어뜨린다.
   */
  it("falls back to the list card when the requested shape has no usable data", () => {
    const noData = renderBrightBodyVisualHtml({
      id: "bar-empty", type: "image", source: "", purpose: "comparison",
      alt: "비교", visual: "bar",
    });
    expect(noData).toContain("<ul");
    const noNumbers = renderBrightBodyVisualHtml({
      id: "bar-text", type: "image", source: "", purpose: "comparison",
      alt: "비교", visual: "bar", data: [{ label: "값 없음" }],
    });
    expect(noNumbers).toContain("<ul");
  });

  /**
   * 워드프레스가 CSS 속성을 허용 목록으로 거른다(2026-08-29 실측: box-sizing 이
   * 잘렸다). 확인되지 않은 속성과 SVG·스크립트를 내보내지 않는지 지킨다.
   */
  it("uses no SVG, no script and no unverified CSS property", () => {
    const html = [
      renderBrightBodyVisualHtml({ id: "a", type: "image", source: "", purpose: "warning", alt: "주의", visual: "timeline", data: [{ label: "6월 1일" }] }),
      renderBrightBodyVisualHtml({ id: "b", type: "image", source: "", purpose: "comparison", alt: "비교", visual: "compare", data: [{ label: "임의가입" }, { label: "임의계속가입" }] }),
      renderBrightBodyVisualHtml({ id: "c", type: "image", source: "", purpose: "summary", alt: "요약", visual: "stat", data: [{ label: "기준", value: 2200, note: "만 원" }] }),
    ].join("");
    for (const banned of ["<svg", "<script", "box-sizing", "display:flex", "display:grid", "transform:", "box-shadow"]) {
      expect(html).not.toContain(banned);
    }
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
