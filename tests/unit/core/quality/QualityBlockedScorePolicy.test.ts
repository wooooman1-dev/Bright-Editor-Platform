import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

const practicalParagraph = "먼저 기록표를 만들고 다음으로 단계별 순서를 확인합니다. 마지막으로 결과를 비교해 다음 행동을 정합니다. ";
const unsafeDocument: ContentDocument = {
  id: "unsafe-usefulness",
  title: "건강 관리 방법",
  blocks: [
    { id: "intro", type: "paragraph", text: `제가 직접 먹어봤고 연구에 따르면 97%가 좋아졌습니다. 건강 관리 방법을 설명합니다. ${practicalParagraph.repeat(4)}` },
    { id: "h1", type: "heading", level: 2, text: "실천 방법" },
    { id: "p1", type: "paragraph", text: practicalParagraph.repeat(12) },
    { id: "h2", type: "heading", level: 2, text: "기록 기준" },
    { id: "p2", type: "paragraph", text: practicalParagraph.repeat(12) },
    { id: "conclusion", type: "paragraph", text: practicalParagraph.repeat(6) },
  ],
};

describe("blocked quality score semantics", () => {
  it("keeps the evaluated usefulness score instead of replacing it with zero", () => {
    const report = new QualityEngine().review(unsafeDocument, {
      contentType: "article",
      platform: "tistory",
      primaryKeyword: "건강 관리",
      searchIntent: "건강 관리 방법",
    });
    const usefulness = report.dimensions.find((item) => item.category === "usefulness");

    expect(usefulness).toMatchObject({ status: "blocked", evaluation: "evaluated" });
    expect(usefulness?.score).toBeGreaterThan(0);
    expect(report.approved).toBe(false);
  });

  it("continues to exclude internal links and CTA from scoring", () => {
    const report = new QualityEngine().review(unsafeDocument, {
      contentType: "article",
      platform: "tistory",
      primaryKeyword: "건강 관리",
      searchIntent: "건강 관리 방법",
    });

    expect(report.weights.internalLinks).toBe(0);
    expect(report.weights.cta).toBe(0);
    expect(report.dimensions.find((item) => item.category === "internalLinks")).toMatchObject({ score: 100, evaluation: "not_evaluated" });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ score: 100, evaluation: "not_evaluated" });
  });
});