import { describe, expect, it } from "vitest";

import type { ApprovalReadinessReport } from "../../../../core/approval";
import type { QualityCategory } from "../../../../core/quality";
import {
  normalizeQualityReview,
  visibleApprovalReadinessChecks,
} from "../../../../app/user-flow/quality-review-ui";

const categories: readonly QualityCategory[] = [
  "searchIntent",
  "seo",
  "readability",
  "structure",
  "completeness",
  "usefulness",
  "htmlQuality",
  "imageStrategy",
  "internalLinks",
  "cta",
];

function readiness(applicationReady: boolean): ApprovalReadinessReport {
  const incomplete = applicationReady ? [] : ["evidence", "duplicate", "site_readiness"];
  return {
    status: applicationReady ? "ready" : "needs_review",
    applicationReady,
    checks: [
      "standard_quality",
      "approval_policy",
      "evidence",
      "duplicate",
      "internal_links",
      "site_readiness",
    ].map((key) => ({
      key: key as ApprovalReadinessReport["checks"][number]["key"],
      status: incomplete.includes(key) ? "not_evaluated" : "passed",
      message: incomplete.includes(key) ? `${key} 검토가 필요합니다.` : `${key} 통과`,
      ...(incomplete.includes(key) ? { action: `${key}를 확인하세요.` } : {}),
    })),
  };
}

function rawQuality(approvalReadiness: ApprovalReadinessReport) {
  return {
    approved: true,
    approvalType: "standard",
    overallScore: 100,
    reviewedAt: "2026-07-27T00:00:00.000Z",
    reviewedRevisionId: "rev-current",
    dimensions: categories.map((category) => ({
      category,
      score: 100,
      status: "ready",
      evaluation: category === "internalLinks" || category === "cta" ? "not_evaluated" : "evaluated",
      reasons: [],
      tasks: [],
      evidence: [],
    })),
    tasks: [],
    approvalReadiness,
  };
}

describe("quality review approval readiness UI", () => {
  it("shows a 100-point manuscript as quality-approved while site gates remain separate", () => {
    const review = normalizeQualityReview(rawQuality(readiness(false)), { currentRevisionId: "rev-current" });

    expect(review.overallScore).toBe(100);
    expect(review.approvalType).toBe("standard");
    expect(review.status).toBe("ready");
    expect(review.approvalReadiness?.applicationReady).toBe(false);
    expect(review.issues).not.toContainEqual(expect.stringContaining("[승인 준비]"));
    expect(review.actionableTasks).toHaveLength(0);
  });

  it("keeps application readiness true only after every independent gate passes", () => {
    const review = normalizeQualityReview(rawQuality(readiness(true)), { currentRevisionId: "rev-current" });

    expect(review.status).toBe("ready");
    expect(review.approvalReadiness?.applicationReady).toBe(true);
  });

  it("hides non-applicable Evidence while preserving the canonical readiness check", () => {
    const report = readiness(true);
    const evidenceIndex = report.checks.findIndex((check) => check.key === "evidence");
    const checks = report.checks.map((check, index) => index === evidenceIndex
      ? { ...check, applicable: false as const }
      : check);
    const review = normalizeQualityReview(rawQuality({ ...report, checks }), { currentRevisionId: "rev-current" });

    expect(review.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      applicable: false,
    }));
    expect(visibleApprovalReadinessChecks(review.approvalReadiness!))
      .not.toContainEqual(expect.objectContaining({ key: "evidence" }));
  });
});
