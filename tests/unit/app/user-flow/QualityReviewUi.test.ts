import { describe, expect, it } from "vitest";

import { normalizeQualityReview } from "../../../../app/user-flow/quality-review-ui";
import { QualityEngine } from "../../../../core/quality";

const document = { id: "content", title: "기획안", blocks: [{ id: "p", type: "paragraph" as const, text: "이 글에서는 내용을 작성할 예정입니다." }] };

describe("Quality Review UI compatibility normalization", () => {
  it.each([
    [undefined, "no_review"],
    [null, "no_review"],
    [{ dimensions: undefined }, "not_evaluated"],
    [{ dimensions: null }, "not_evaluated"],
    [{ dimensions: "invalid" }, "not_evaluated"],
  ] as const)("normalizes missing or malformed dimensions without throwing", (value, status) => {
    expect(normalizeQualityReview(value)).toMatchObject({ dimensions: [], overallScore: null, status });
  });

  it("does not promote a legacy score to the new overall score", () => {
    expect(normalizeQualityReview({ score: 100, seoReady: true, readabilityReady: true })).toMatchObject({ dimensions: [], overallScore: null, status: "not_evaluated", revisionId: null });
  });

  it("keeps a new planning review canonical and non-ready", () => {
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "내용", searchIntent: "내용", reviewedAt: "2026-01-01T00:00:00.000Z" });
    const normalized = normalizeQualityReview(report, { currentRevisionId: report.reviewedRevisionId });
    expect(normalized.dimensions).toHaveLength(10);
    expect(normalized.overallScore).toBeLessThan(100);
    expect(normalized.status).toBe("improvement_required");
  });

  it("marks a revision mismatch as stale", () => {
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "내용", searchIntent: "내용" });
    expect(normalizeQualityReview(report, { currentRevisionId: "rev-new" }).status).toBe("stale");
  });

  it("marks a blocked not_evaluated dimension explicitly", () => {
    const report = new QualityEngine().review(document);
    expect(normalizeQualityReview(report, { currentRevisionId: report.reviewedRevisionId }).status).toBe("not_evaluated");
  });

  it("represents loading and API errors independently of persisted data", () => {
    expect(normalizeQualityReview(undefined, { requestState: "loading" }).status).toBe("loading");
    expect(normalizeQualityReview(undefined, { requestState: "error", errorMessage: "API unavailable" })).toMatchObject({ status: "error", issues: ["API unavailable"] });
  });

  it("preserves exception approval for the personal editor UI", () => {
    const report = {
      approved: true,
      approvalType: "exception",
      overallScore: 92,
      reviewedRevisionId: "rev-exception",
      reviewedAt: "2026-07-19T00:00:00.000Z",
      dimensions: [{ category: "searchIntent", score: 92, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] }],
      tasks: [],
    };
    expect(normalizeQualityReview(report)).toMatchObject({ status: "ready", approvalType: "exception", overallScore: 92 });
  });

});
