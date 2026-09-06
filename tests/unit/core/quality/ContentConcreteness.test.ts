import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import {
  concretenessScore,
  measureContentConcreteness,
  QualityEngine,
  qualityDimensionWeights,
  readerDeferralScore,
} from "../../../../core/quality";

describe("ContentConcreteness", () => {
  it("counts figures that carry a unit and ignores ordinal prose", () => {
    const measurement = measureContentConcreteness(document([
      "총소득 기준금액은 2,200만원이고 재산은 2.4억원 미만이어야 합니다.",
      "1단계로 가구 유형을 정하고 세 가지 항목을 차례로 확인합니다.",
      "신청 기간은 5월 1일부터 5월 31일까지입니다.",
    ]));

    expect(measurement.concreteFacts).toBe(4);
    expect(measurement.proseCharacters).toBeGreaterThan(0);
    expect(measurement.concretePerThousand).toBeGreaterThan(0);
  });

  it("counts a sentence that sends the reader to a counter, once per sentence", () => {
    const measurement = measureContentConcreteness(document([
      "정확한 금액은 국세청 홈페이지에서 확인하고 문의하세요.",
      "가구 유형이 바뀌었다면 그 조건을 먼저 확인합니다.",
    ]));

    expect(measurement.deferrals).toBe(1);
    expect(measurement.deferralExamples[0]).toContain("국세청 홈페이지");
  });

  it("does not treat an in-body condition check as a deferral", () => {
    expect(measureContentConcreteness(document([
      "배우자의 소득이 기준선 아래인지 확인하면 홑벌이 가구로 판단할 수 있습니다.",
    ])).deferrals).toBe(0);
  });

  it("scores an article with no verifiable figure at zero and a dense one at full", () => {
    expect(concretenessScore(measureContentConcreteness(document(["기준에 따라 달라질 수 있습니다."])))).toBe(0);
    expect(concretenessScore({ concreteFacts: 30, concretePerThousand: 3, deferralExamples: [], deferrals: 0, proseCharacters: 10000 })).toBe(100);
    expect(readerDeferralScore({ concreteFacts: 0, concretePerThousand: 0, deferralExamples: [], deferrals: 12, proseCharacters: 1000 })).toBe(4);
    expect(readerDeferralScore({ concreteFacts: 0, concretePerThousand: 0, deferralExamples: [], deferrals: 0, proseCharacters: 1000 })).toBe(100);
  });
});

describe("QualityEngine display-only dimensions", () => {
  // D-050: 표시 전용. 총점, 승인 판정, 검토 AI 호출 조건 어느 것도 건드리지 않는다.
  it("keeps both new dimensions at weight zero", () => {
    expect(qualityDimensionWeights.concreteness).toBe(0);
    expect(qualityDimensionWeights.readerDeferral).toBe(0);
  });

  it("leaves the overall score identical to the same score computed without them", () => {
    const report = new QualityEngine().review(document(["기준에 따라 달라질 수 있으니 홈페이지에서 확인하세요."]));
    const legacy = report.dimensions.filter((item) => item.category !== "concreteness" && item.category !== "readerDeferral");
    const weighted = (list: typeof legacy) => Math.round(
      list.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0)
      / list.reduce((sum, item) => sum + qualityDimensionWeights[item.category], 0));

    expect(report.overallScore).toBe(weighted(legacy));
  });

  it("never marks the new dimensions as blocked even at score zero", () => {
    const report = new QualityEngine().review(document(["기준에 따라 달라질 수 있습니다."]));
    const added = report.dimensions.filter((item) => item.category === "concreteness" || item.category === "readerDeferral");

    expect(added).toHaveLength(2);
    expect(added.every((item) => item.status !== "blocked")).toBe(true);
    expect(added.every((item) => item.evaluation === "not_evaluated")).toBe(true);
  });

  it("still surfaces the shortfall as an improvement task", () => {
    const report = new QualityEngine().review(document(["기준에 따라 달라질 수 있으니 국세청 홈페이지에서 확인하세요."]));
    const messages = report.tasks.filter((item) => item.category === "concreteness" || item.category === "readerDeferral").map((item) => item.message);

    expect(messages.join(" ")).toContain("확인 가능한 수치");
    expect(report.tasks.some((item) => item.category === "readerDeferral")).toBe(true);
  });
});

function document(paragraphs: readonly string[]): ContentDocument {
  return {
    id: "concreteness",
    title: "근로장려금 신청 조건",
    blocks: [
      ...paragraphs.map((text, index) => ({ id: `p-${index + 1}`, type: "paragraph" as const, text })),
    ],
  };
}
