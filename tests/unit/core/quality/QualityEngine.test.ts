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
    expect(report.dimensions.find((item) => item.category === "internalLinks")?.evidence).toContainEqual({ signal: "placedContextualInternalLinks", value: 1 });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ score: 100, status: "ready", evaluation: "not_evaluated" });
  });

  it("does not award a ready internal-link score when only final related posts exist", () => {
    const document: ContentDocument = { id: "related-only", title: "관련 글만 있는 원고", blocks: [
      { id: "p", type: "paragraph", text: "본문 중간 링크 없이 관련 글만 배치된 원고입니다. 두 번째 문장으로 품질 평가 조건을 설명합니다." },
      ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}`, target: "_self" as const })),
    ] };
    const dimension = new QualityEngine().review(document, { platform: "tistory", primaryKeyword: "관련 글", searchIntent: "관련 글 확인" }).dimensions.find((item) => item.category === "internalLinks");
    expect(dimension?.score).toBeLessThan(85);
    expect(dimension?.reasons).toContain("본문 중간에 실제 URL이 있는 내부 링크가 없습니다.");
    expect(dimension?.evidence).toContainEqual({ signal: "placedRelatedPosts", value: 3 });
  });

  it("penalizes repeated one-sentence paragraphs and keyword stuffing", () => {
    const repeated = "건강 관리가 중요합니다.";
    const document: ContentDocument = { id: "repeated", title: "건강 관리 건강 관리 건강 관리", metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 30, metaDescription: "건강 관리 ".repeat(20) }, blocks: Array.from({ length: 18 }, (_, index) => ({ id: `p-${index}`, type: "paragraph", text: repeated })) };
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.dimensions.find((item) => item.category === "readability")?.score).toBeLessThan(80);
    expect(report.dimensions.find((item) => item.category === "seo")?.score).toBeLessThan(80);
  });

  it("blocks unsupported statistics and fabricated first-person experience", () => {
    const document: ContentDocument = { id: "unsafe", title: "건강 관리 방법", blocks: [
      { id: "intro", type: "paragraph", text: "제가 직접 먹어봤고 연구에 따르면 97%가 좋아졌습니다. 건강 관리 방법을 설명합니다." },
      { id: "h", type: "heading", level: 2, text: "실천 방법" },
      { id: "p", type: "paragraph", text: "검증되지 않은 개인 경험을 사실처럼 단정하는 본문입니다." },
    ] };
    const report = new QualityEngine().review(document, { primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.dimensions.find((item) => item.category === "usefulness")).toMatchObject({ score: 0, status: "blocked" });
    expect(report.approved).toBe(false);
  });

  it("can approve a complete article without uploaded images or an unnecessary CTA", () => {
    const base = structured();
    const filler = "독자가 실천할 수 있는 기준과 확인 순서를 구체적으로 설명합니다. 결과를 기록하고 비교하면 상황에 맞게 방법을 조정할 수 있습니다. ";
    const rawBlocks: ContentDocument["blocks"] = [
      ...base.blocks.filter((block) => block.type !== "button").flatMap((block) => block.type === "paragraph" && block.text.length > 500 ? [{ ...block, id: `${block.id}-a`, text: block.text.slice(0, Math.ceil(block.text.length / 2)) }, { ...block, id: `${block.id}-b`, text: block.text.slice(Math.ceil(block.text.length / 2)) }] : [block]).map((block) => block.type === "image" ? { ...block, source: "" } : block),
      { id: "h-extra", type: "heading", level: 2, text: "상황별 조정 기준" },
      ...Array.from({ length: 10 }, (_, index) => ({ id: `filler-${index}`, type: "paragraph" as const, text: `${index + 1}번째 확인 항목에서는 조건을 구분합니다. ${filler.repeat(3)}` })),
      { id: "internal", type: "button", purpose: "internal_link", label: "건강 기록", targetUrl: "https://bright-health.tistory.com/entry/health-log" },
      ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 건강 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}` })),
    ];
    const blocks = rawBlocks.map((block, index) => block.type === "paragraph" ? { ...block, text: `${index + 1}번째 문단은 서로 다른 관점에서 설명합니다. ${block.text}` } : block);
    const document: ContentDocument = { ...base, metadata: { buttonCount: 4, createdAt: "now", generator: "test", imageCount: 1, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1000, metaDescription: "건강 관리 방법을 생활 속에서 실천할 수 있도록 준비 단계와 확인 기준, 흔한 실수, 상황별 조정 방법을 구체적으로 안내합니다.", primarySearchIntent: "건강 관리 방법을 찾는 독자에게 실천 기준을 제공합니다." }, blocks };
    const report = new QualityEngine().review(document, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.overallScore).toBeGreaterThanOrEqual(95);
    expect(report.approved).toBe(true);
    expect(report.reviewedRevisionId).toBe(contentRevisionId(document));
    expect(report.dimensions.find((item) => item.category === "imageStrategy")?.evidence).toContainEqual({ signal: "uploadedImageBlocks", value: 0 });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ evaluation: "not_evaluated", status: "ready" });
  });
});
