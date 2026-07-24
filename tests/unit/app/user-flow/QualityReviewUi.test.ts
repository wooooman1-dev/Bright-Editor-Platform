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

  it("explains why an overall score of 95 is not approved when readability is below both approval thresholds", () => {
    const report = {
      approved: false,
      approvalType: "none",
      overallScore: 95,
      reviewedRevisionId: "rev-quality",
      reviewedAt: "2026-07-24T00:00:00.000Z",
      dimensions: [
        { category: "searchIntent", score: 100, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "seo", score: 100, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "readability", score: 88, status: "needs_improvement", evaluation: "evaluated", reasons: ["짧은 문단이 반복됩니다."], tasks: ["문단 흐름을 보완하세요."], evidence: [] },
        { category: "structure", score: 88, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "completeness", score: 100, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "usefulness", score: 85, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "htmlQuality", score: 100, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "imageStrategy", score: 100, status: "ready", evaluation: "evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "internalLinks", score: 100, status: "ready", evaluation: "not_evaluated", reasons: [], tasks: [], evidence: [] },
        { category: "cta", score: 100, status: "ready", evaluation: "not_evaluated", reasons: [], tasks: [], evidence: [] },
      ],
      tasks: [{ category: "readability", message: "문단 흐름을 보완하세요." }],
    };
    const normalized = normalizeQualityReview(report);
    expect(normalized.status).toBe("improvement_required");
    expect(normalized.actionableTasks[0]?.message).toContain("전체 95점 이상");
    expect(normalized.actionableTasks[0]?.message).toContain("가독성 88점(표준 95점 필요, 예외 90점 필요)");
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
