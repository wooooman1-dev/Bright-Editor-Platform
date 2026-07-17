import type { QualityCategory, QualityReport } from "./QualityEngine";

export type QualityScoreRegression = Readonly<{
  after: number;
  before: number;
  category: QualityCategory;
}>;

export type QualityImprovementDecision = Readonly<{
  accepted: boolean;
  afterOverallScore: number;
  beforeOverallScore: number;
  improvedTargetCategories: readonly QualityCategory[];
  reasons: readonly string[];
  regressions: readonly QualityScoreRegression[];
  targetCategories: readonly QualityCategory[];
}>;

export function evaluateQualityImprovement(
  before: QualityReport,
  after: QualityReport,
): QualityImprovementDecision {
  const beforeScores = new Map(before.dimensions.map((item) => [item.category, item.score]));
  const afterScores = new Map(after.dimensions.map((item) => [item.category, item.score]));
  const targetCategories = [...new Set(before.tasks.map((task) => task.category))];
  const regressions = before.dimensions.flatMap((item) => {
    const candidateScore = afterScores.get(item.category);
    return candidateScore === undefined || candidateScore < item.score
      ? [{ category: item.category, before: item.score, after: candidateScore ?? 0 }]
      : [];
  });
  const improvedTargetCategories = targetCategories.filter(
    (category) => (afterScores.get(category) ?? 0) > (beforeScores.get(category) ?? 0),
  );
  const reasons: string[] = [];

  if (!targetCategories.length) reasons.push("개선할 품질 항목이 없습니다.");
  if (after.overallScore <= before.overallScore) reasons.push(`전체 점수가 상승하지 않았습니다. ${before.overallScore} → ${after.overallScore}`);
  if (regressions.length) reasons.push(`기존 품질 항목이 하락했습니다: ${regressions.map((item) => `${item.category} ${item.before} → ${item.after}`).join(", ")}`);
  if (targetCategories.length && !improvedTargetCategories.length) reasons.push("개선 대상 점수가 하나도 상승하지 않았습니다.");

  return Object.freeze({
    accepted: reasons.length === 0,
    afterOverallScore: after.overallScore,
    beforeOverallScore: before.overallScore,
    improvedTargetCategories: Object.freeze(improvedTargetCategories),
    reasons: Object.freeze(reasons),
    regressions: Object.freeze(regressions),
    targetCategories: Object.freeze(targetCategories),
  });
}

export function qualityImprovementRejectionMessage(decision: QualityImprovementDecision): string {
  return `AI 개선안이 현재 원고보다 좋아지지 않아 적용하지 않았습니다. ${decision.reasons.join(" ")}`;
}
