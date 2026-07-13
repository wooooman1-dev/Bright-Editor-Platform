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
});
