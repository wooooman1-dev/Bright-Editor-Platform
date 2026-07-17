import { describe, expect, it } from "vitest";

import { evaluateQualityImprovement, qualityDimensionWeights, qualityImprovementRejectionMessage, type QualityCategory, type QualityReport } from "../../../../core/quality";

const categories: readonly QualityCategory[] = ["searchIntent", "seo", "readability", "structure", "completeness", "usefulness", "htmlQuality", "imageStrategy", "internalLinks", "cta"];

function report(overallScore: number, scores: Partial<Record<QualityCategory, number>>, targets: readonly QualityCategory[] = ["seo"]): QualityReport {
  const dimensions = categories.map((category) => ({
    category,
    score: scores[category] ?? 100,
    status: (scores[category] ?? 100) >= 85 ? "ready" as const : "needs_improvement" as const,
    evaluation: "evaluated" as const,
    reasons: [],
    tasks: targets.includes(category) ? [`Improve ${category}`] : [],
    evidence: [],
  }));
  return {
    approved: false,
    approvalState: "improvement_required",
    findings: [],
    overallScore,
    reviews: dimensions,
    dimensions,
    tasks: targets.map((category) => ({ category, message: `Improve ${category}`, status: "action_required" as const })),
    reviewedAt: "2026-07-17T00:00:00.000Z",
    reviewedRevisionId: "rev-test",
    weights: qualityDimensionWeights,
  };
}

describe("evaluateQualityImprovement", () => {
  it("accepts a higher overall score when a target improves and no dimension regresses", () => {
    const decision = evaluateQualityImprovement(report(95, { seo: 65 }), report(96, { seo: 75 }));
    expect(decision).toMatchObject({ accepted: true, beforeOverallScore: 95, afterOverallScore: 96, regressions: [] });
    expect(decision.improvedTargetCategories).toEqual(["seo"]);
  });

  it("rejects an improvement when the requested SEO score falls", () => {
    const decision = evaluateQualityImprovement(report(95, { seo: 65 }), report(92, { seo: 55 }));
    expect(decision.accepted).toBe(false);
    expect(decision.regressions).toContainEqual({ category: "seo", before: 65, after: 55 });
    expect(qualityImprovementRejectionMessage(decision)).toContain("seo 65 → 55");
  });

  it("rejects an improvement when a protected ready dimension falls", () => {
    const decision = evaluateQualityImprovement(report(95, { seo: 65, readability: 96 }), report(96, { seo: 80, readability: 77 }));
    expect(decision.accepted).toBe(false);
    expect(decision.regressions).toContainEqual({ category: "readability", before: 96, after: 77 });
  });

  it("requires the total score to rise instead of accepting a lateral rewrite", () => {
    const decision = evaluateQualityImprovement(report(95, { seo: 65 }), report(95, { seo: 70 }));
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toContain("전체 점수가 상승하지 않았습니다. 95 → 95");
  });
});
