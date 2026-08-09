import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

describe("QualityEngine editorial markup integrity", () => {
  it("blocks a canonical document that still exposes Markdown link syntax", () => {
    const clean: ContentDocument = {
      id: "content-1",
      title: "신용점수 관리 방법",
      blocks: [{
        id: "paragraph-1",
        type: "paragraph",
        text: "신용점수는 거래 습관을 같은 기준으로 점검할 때 관리 방향을 정하기 쉽습니다. 먼저 연체 여부와 대출 이용 상태를 확인합니다.",
      }],
    };
    const contaminated: ContentDocument = {
      ...clean,
      blocks: [{
        ...clean.blocks[0],
        type: "paragraph",
        text: "신용점수 기준은 [금융위원회 공식 안내](https://fsc.go.kr/example)에서 확인합니다.",
      }],
    };

    const cleanReport = new QualityEngine().review(clean);
    const report = new QualityEngine().review(contaminated);
    const htmlQuality = report.dimensions.find((dimension) => dimension.category === "htmlQuality");

    expect(cleanReport.dimensions.find((dimension) => dimension.category === "htmlQuality")?.score).toBe(100);
    expect(htmlQuality).toMatchObject({ score: 0, status: "blocked", evaluation: "evaluated" });
    expect(htmlQuality?.evidence).toContainEqual({ signal: "editorialMarkupIssueCount", value: 1 });
    expect(htmlQuality?.evidence).toContainEqual({ signal: "editorialMarkupIssueCodes", value: "markdown_link" });
    expect(report.approved).toBe(false);
    expect(report.approvalType).toBe("none");
    expect(report.approvalState).toBe("blocked");
    expect(report.overallScore).toBeLessThan(cleanReport.overallScore);
    expect(report.findings).toContainEqual(expect.objectContaining({
      category: "htmlQuality",
      severity: "error",
    }));
  });
});
