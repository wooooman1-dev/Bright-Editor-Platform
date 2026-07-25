import { describe, expect, it } from "vitest";

import { normalizeQualityReview } from "../../../../app/user-flow/quality-review-ui";

function reviewWithInternalLinkReason(reason: string) {
  return {
    approved: true,
    approvalType: "standard",
    overallScore: 100,
    reviewedRevisionId: "rev-links",
    reviewedAt: "2026-07-25T00:00:00.000Z",
    dimensions: [{
      category: "internalLinks",
      score: 100,
      status: "ready",
      evaluation: "not_evaluated",
      reasons: [reason],
      tasks: [],
      evidence: [
        { signal: "scoringExcluded", value: true },
        { signal: "placedContextualInternalLinks", value: 1 },
        { signal: "placedRelatedPosts", value: 3 },
        { signal: "availableSameCategoryCandidates", value: 3 },
        { signal: "catalogStatus", value: "category_missing" },
      ],
    }],
    tasks: [],
  };
}

describe("internal-link Quality Review UI diagnostics", () => {
  it("replaces stale category-missing text when verified links are already placed", () => {
    const normalized = normalizeQualityReview(reviewWithInternalLinkReason(
      "현재 콘텐츠의 Tistory 카테고리가 확인되지 않아 내부 링크 자동 배치를 생략했습니다.",
    ));
    const dimension = normalized.dimensions[0];

    expect(dimension?.reasons).toEqual(["본문 내부 링크 1개와 관련 글 3개가 배치되어 있습니다."]);
    expect(dimension?.evidence).toContainEqual({ signal: "배치된 본문 내부 링크 수", value: "1개" });
    expect(dimension?.evidence).toContainEqual({ signal: "배치된 관련 글 수", value: "3개" });
  });

  it("keeps category-missing text when no links are placed", () => {
    const report = reviewWithInternalLinkReason(
      "현재 콘텐츠의 Tistory 카테고리가 확인되지 않아 내부 링크 자동 배치를 생략했습니다.",
    );
    report.dimensions[0].evidence[1].value = 0;
    report.dimensions[0].evidence[2].value = 0;

    expect(normalizeQualityReview(report).dimensions[0]?.reasons).toContain(
      "현재 콘텐츠의 Tistory 카테고리가 확인되지 않아 내부 링크 자동 배치를 생략했습니다.",
    );
  });
});
