import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import {
  measureSentenceFormality,
  QualityEngine,
  qualityDimensionWeights,
  sentenceFormalityScore,
} from "../../../../core/quality";

describe("SentenceFormality", () => {
  it("catches the 2026-08-29 실측 defect: a plain-form ending mixed into polite prose", () => {
    const measurement = measureSentenceFormality(document([
      "근로소득자는 일정 요건을 충족하면 소득공제를 받을 수 있다.",
      "신청은 홈택스에서 진행할 수 있습니다.",
    ]));

    expect(measurement.informalSentences).toBe(1);
    expect(measurement.informalExamples[0]).toContain("받을 수 있다");
  });

  it("does not flag 습니다/합니다/세요/십시오 endings", () => {
    const measurement = measureSentenceFormality(document([
      "신청 기간은 5월 31일까지입니다.",
      "국세청 홈페이지에서 서류를 확인하세요.",
      "자세한 사항은 관할 세무서에 문의하십시오.",
      "제출 서류는 신분증과 소득 증빙 자료입니다.",
    ]));

    expect(measurement.informalSentences).toBe(0);
  });

  it("does not repeat the earlier measurement bug of matching inside 니다 (e.g. …집니다)", () => {
    const measurement = measureSentenceFormality(document([
      "신청 절차가 지난해보다 간단해집니다.",
    ]));

    expect(measurement.informalSentences).toBe(0);
  });

  it("scores zero informal sentences at 100 and penalizes each additional one", () => {
    expect(sentenceFormalityScore({ informalExamples: [], informalSentences: 0, totalSentences: 10 })).toBe(100);
    expect(sentenceFormalityScore({ informalExamples: [], informalSentences: 3, totalSentences: 10 })).toBe(70);
  });
});

describe("QualityEngine display-only formality dimension", () => {
  it("stays at weight zero and never blocks", () => {
    expect(qualityDimensionWeights.formality).toBe(0);

    const report = new QualityEngine().review(document(["소득공제를 받을 수 있다."]));
    const added = report.dimensions.filter((item) => item.category === "formality");

    expect(added).toHaveLength(1);
    expect(added[0]?.status).not.toBe("blocked");
    expect(added[0]?.evaluation).toBe("not_evaluated");
  });

  it("surfaces the informal count as a task message", () => {
    const report = new QualityEngine().review(document(["소득공제를 받을 수 있다."]));
    const messages = report.tasks.filter((item) => item.category === "formality").map((item) => item.message);

    expect(messages.join(" ")).toContain("반말로 끝난 문장");
  });
});

function document(paragraphs: readonly string[]): ContentDocument {
  return {
    id: "formality",
    title: "근로소득 공제 안내",
    blocks: [
      ...paragraphs.map((text, index) => ({ id: `p-${index + 1}`, type: "paragraph" as const, text })),
    ],
  };
}
