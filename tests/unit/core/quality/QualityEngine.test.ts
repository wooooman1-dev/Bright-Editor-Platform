import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { contentRevisionId, PublishingGate, QualityEngine, qualityDimensionWeights } from "../../../../core/quality";

const planning: ContentDocument = { id: "planning", title: "건강 관리 가이드 기획안", blocks: [
  { id: "h", type: "heading", level: 2, text: "작성할 내용" },
  { id: "p", type: "paragraph", text: "이 글에서는 건강 관리 방법을 다룰 예정입니다. 구체적인 사례와 결론은 추가 예정입니다." },
] };

function structured(): ContentDocument {
  const paragraph = "독자가 바로 실행할 수 있도록 원인과 방법을 구체적인 사례로 설명합니다. 매일 기록하고 결과를 비교하면 자신의 상황에 맞는 선택을 할 수 있습니다. ";
  return { id: "article", title: "건강 관리 실천 방법 완전 가이드", blocks: [
    { id: "intro", type: "paragraph", text: paragraph.repeat(3) },
    ...Array.from({ length: 4 }, (_, index) => ([
      { id: `h${index}`, type: "heading" as const, level: 2 as const, text: `실천 단계 ${index + 1}` },
      { id: `p${index}`, type: "paragraph" as const, text: paragraph.repeat(8) },
    ])).flat(),
    { id: "image", type: "image", source: "/health.png", alt: "건강 관리 단계" },
    { id: "link", type: "button", label: "관련 건강 기록 보기", targetUrl: "/health-log" },
    { id: "conclusion", type: "paragraph", text: `지금까지의 핵심은 작은 행동을 기록하고 꾸준히 조정하는 것입니다. ${paragraph.repeat(2)}` },
  ] };
}

describe("QualityEngine dimension scoring", () => {
  it("never gives a planning document a publish-ready score", () => {
    const report = new QualityEngine().review(planning, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법", reviewedAt: "2026-01-01T00:00:00.000Z" });
    expect(report.overallScore).toBeLessThan(70);
    expect(report.overallScore).not.toBe(100);
    expect(report.approved).toBe(false);
    expect(report.dimensions.find((item) => item.category === "completeness")?.evidence).toContainEqual({ signal: "planningLanguageDetected", value: true });
    expect(report.tasks.length).toBeGreaterThan(0);
  });

  it("blocks an empty document and exposes not_evaluated evidence", () => {
    const report = new QualityEngine().review({ id: "empty", title: "", blocks: [] });
    expect(report.overallScore).toBeLessThan(30);
    expect(report.dimensions.find((item) => item.category === "searchIntent")).toMatchObject({ status: "blocked", evaluation: "not_evaluated" });
  });

  it("scores a structured article higher than a short incomplete article", () => {
    const context = { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리" };
    const short = new QualityEngine().review({ id: "short", title: "건강 관리", blocks: [{ id: "p", type: "paragraph", text: "짧은 설명입니다." }] }, context);
    const complete = new QualityEngine().review(structured(), context);
    expect(complete.overallScore).toBeGreaterThan(short.overallScore);
    expect(complete.dimensions).toHaveLength(10);
  });

  it("calculates the overall score from the canonical weights", () => {
    const report = new QualityEngine().review(structured(), { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리" });
    const expected = Math.round(report.dimensions.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0) / 100);
    expect(Object.values(qualityDimensionWeights).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(report.overallScore).toBe(expected);
  });

  it("matches the reviewed revision and invalidates stale approval", () => {
    const document = structured(), revision = contentRevisionId(document);
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리", revisionId: revision });
    expect(report.reviewedRevisionId).toBe(revision);
    expect(() => new PublishingGate().assertReady({ ...report, approved: true }, "rev-stale")).toThrow("stale");
  });

  it("distinguishes recommendations from placed image, internal-link, and CTA blocks", () => {
    const recommended: ContentDocument = { id: "recommendations", title: "추천만 있는 문서", blocks: [
      { id: "p", type: "paragraph", text: "이미지 전략과 CTA 전략, 내부 링크 계획을 추천합니다." },
      { id: "image", type: "image", source: "", alt: "추천 이미지" },
      { id: "internal", type: "button", purpose: "internal_link", label: "관련 글", targetUrl: "https://bright-health.tistory.com/entry/related" },
    ] };
    const report = new QualityEngine().review(recommended, { primaryKeyword: "추천", searchIntent: "추천" });
    expect(report.dimensions.find((item) => item.category === "imageStrategy")).toMatchObject({ score: 100 });
    expect(report.dimensions.find((item) => item.category === "internalLinks")?.evidence).toContainEqual({ signal: "placedInternalLinks", value: 1 });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ score: 100, status: "ready", evaluation: "not_evaluated" });
  });

  it("can approve a complete article without uploaded images or an unnecessary CTA", () => {
    const base = structured();
    const filler = "독자가 실천할 수 있는 기준과 확인 순서를 구체적으로 설명합니다. 결과를 기록하고 비교하면 상황에 맞게 방법을 조정할 수 있습니다. ";
    const document: ContentDocument = { ...base, metadata: { buttonCount: 4, createdAt: "now", generator: "test", imageCount: 1, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1000, metaDescription: "건강 관리 실천 방법을 구체적인 단계와 사례로 설명합니다.", primarySearchIntent: "건강 관리 방법을 찾는 독자에게 실천 기준을 제공합니다." }, blocks: [
      ...base.blocks.filter((block) => block.type !== "button").flatMap((block) => block.type === "paragraph" && block.text.length > 500 ? [{ ...block, id: `${block.id}-a`, text: block.text.slice(0, Math.ceil(block.text.length / 2)) }, { ...block, id: `${block.id}-b`, text: block.text.slice(Math.ceil(block.text.length / 2)) }] : [block]).map((block) => block.type === "image" ? { ...block, source: "" } : block),
      ...Array.from({ length: 8 }, (_, index) => ({ id: `filler-${index}`, type: "paragraph" as const, text: filler.repeat(3) })),
      { id: "internal", type: "button", purpose: "internal_link", label: "건강 기록", targetUrl: "https://bright-health.tistory.com/entry/health-log" },
      ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 건강 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}` })),
    ] };
    const report = new QualityEngine().review(document, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.overallScore).toBeGreaterThanOrEqual(95);
    expect(report.approved).toBe(true);
    expect(report.reviewedRevisionId).toBe(contentRevisionId(document));
    expect(report.dimensions.find((item) => item.category === "imageStrategy")?.evidence).toContainEqual({ signal: "uploadedImageBlocks", value: 0 });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ evaluation: "not_evaluated", status: "ready" });
  });
});
