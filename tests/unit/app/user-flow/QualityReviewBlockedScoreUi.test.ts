import { describe, expect, it } from "vitest";

import { normalizeQualityReview } from "../../../../app/user-flow/quality-review-ui";

const common = {
  reasons: ["검증이 필요한 주장입니다."],
  tasks: ["출처를 확인하세요."],
  evidence: [],
};

describe("quality review UI blocked score handling", () => {
  it("shows an evaluated blocked dimension as improvement required, not not evaluated", () => {
    const review = normalizeQualityReview({
      approved: false,
      approvalType: "none",
      overallScore: 94,
      reviewedRevisionId: "rev-1",
      reviewedAt: "2026-07-22T00:00:00.000Z",
      dimensions: [
        { category: "usefulness", score: 88, status: "blocked", evaluation: "evaluated", ...common },
      ],
      tasks: [],
    });

    expect(review.status).toBe("improvement_required");
    expect(review.dimensions[0]).toMatchObject({ category: "usefulness", score: 88, status: "blocked", evaluation: "evaluated" });
  });

  it("keeps a genuinely missing blocked evaluation in not evaluated state", () => {
    const review = normalizeQualityReview({
      approved: false,
      approvalType: "none",
      overallScore: 70,
      reviewedRevisionId: "rev-1",
      reviewedAt: "2026-07-22T00:00:00.000Z",
      dimensions: [
        { category: "searchIntent", score: 0, status: "blocked", evaluation: "not_evaluated", ...common },
      ],
      tasks: [],
    });

    expect(review.status).toBe("not_evaluated");
  });
});
