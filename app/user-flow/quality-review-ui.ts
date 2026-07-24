import type { QualityApprovalType, QualityCategory, QualityDimensionResult } from "../../core/quality";

const categories: readonly QualityCategory[] = ["searchIntent", "seo", "readability", "structure", "completeness", "usefulness", "htmlQuality", "imageStrategy", "internalLinks", "cta"];
const scoringCategories = new Set<QualityCategory>(["searchIntent", "seo", "readability", "structure", "completeness", "usefulness", "htmlQuality", "imageStrategy"]);
const editorialTargets = new Set<QualityCategory>(["searchIntent", "seo", "readability", "completeness"]);

export type QualityUiStatus = "no_review" | "loading" | "error" | "not_evaluated" | "stale" | "improvement_required" | "ready";
export type NormalizedQualityReview = Readonly<{
  dimensions: readonly QualityDimensionResult[];
  overallScore: number | null;
  approvalType: QualityApprovalType;
  status: QualityUiStatus;
  revisionId: string | null;
  reviewedAt: string | null;
  issues: readonly string[];
  actionableTasks: readonly Readonly<{ category: QualityCategory; message: string }>[];
}>;

export function normalizeQualityReview(
  value: unknown,
  context: Readonly<{ currentRevisionId?: string; requestState?: "idle" | "loading" | "error"; errorMessage?: string }> = {},
): NormalizedQualityReview {
  if (context.requestState === "loading") return empty("loading");
  if (context.requestState === "error") return { ...empty("error"), issues: Object.freeze([context.errorMessage?.trim() || "품질 검토 중 오류가 발생했습니다."]) };
  if (!isRecord(value)) return empty("no_review");

  const rawDimensions = Array.isArray(value.dimensions) ? value.dimensions : undefined;
  const dimensions = rawDimensions ? rawDimensions.flatMap(normalizeDimension) : [];
  const canonicalDimensions = Boolean(rawDimensions && dimensions.length === rawDimensions.length && dimensions.length > 0);
  if (!canonicalDimensions) return empty("not_evaluated");

  const revisionId = text(value.reviewedRevisionId);
  const reviewedAt = text(value.reviewedAt);
  const overallScore = score(value.overallScore);
  if (!revisionId || !reviewedAt || overallScore === null) return { ...empty("not_evaluated"), dimensions: Object.freeze(dimensions) };

  const issues = dimensions.flatMap((dimension) => dimension.reasons);
  const stale = Boolean(context.currentRevisionId && revisionId !== context.currentRevisionId);
  const notEvaluated = dimensions.some((dimension) => dimension.status === "blocked" && dimension.evaluation === "not_evaluated");
  const approved = value.approved === true;
  const approvalType: QualityApprovalType = value.approvalType === "exception" ? "exception" : value.approvalType === "standard" ? "standard" : approved ? "standard" : "none";
  const status: QualityUiStatus = stale ? "stale" : notEvaluated ? "not_evaluated" : approved ? "ready" : "improvement_required";
  const approvalTasks = approved || stale || notEvaluated ? [] : qualityApprovalTasks(dimensions, overallScore);
  const actionableTasks = [...approvalTasks, ...normalizeTasks(value.tasks, dimensions)];
  return Object.freeze({ dimensions: Object.freeze(dimensions), overallScore, approvalType, status, revisionId, reviewedAt, issues: Object.freeze(issues), actionableTasks: Object.freeze(actionableTasks) });
}

function normalizeDimension(value: unknown): QualityDimensionResult[] {
  if (!isRecord(value) || !categories.includes(value.category as QualityCategory)) return [];
  const normalizedScore = score(value.score);
  if (normalizedScore === null || !["ready", "needs_improvement", "blocked"].includes(String(value.status)) || !["evaluated", "not_evaluated"].includes(String(value.evaluation))) return [];
  return [Object.freeze({
    category: value.category as QualityCategory,
    score: normalizedScore,
    status: value.status as QualityDimensionResult["status"],
    evaluation: value.evaluation as QualityDimensionResult["evaluation"],
    reasons: Object.freeze(strings(value.reasons)),
    tasks: Object.freeze(strings(value.tasks)),
    evidence: Object.freeze(Array.isArray(value.evidence) ? value.evidence.filter((item): item is QualityDimensionResult["evidence"][number] => isRecord(item) && typeof item.signal === "string" && ["string", "number", "boolean"].includes(typeof item.value)) : []),
  })];
}

function qualityApprovalTasks(dimensions: readonly QualityDimensionResult[], overallScore: number): Readonly<{ category: QualityCategory; message: string }>[] {
  const shortfalls = dimensions
    .filter((dimension) => scoringCategories.has(dimension.category))
    .flatMap((dimension) => {
      const standardRequired = editorialTargets.has(dimension.category) ? 95 : 80;
      if (dimension.score >= standardRequired) return [];
      const exceptionRequired = editorialTargets.has(dimension.category) ? 90 : 80;
      const exceptionText = dimension.score < exceptionRequired ? `, 예외 ${exceptionRequired}점 필요` : "";
      return [`${qualityLabel(dimension.category)} ${dimension.score}점(표준 ${standardRequired}점 필요${exceptionText})`];
    });
  if (overallScore < 95) shortfalls.unshift(`전체 ${overallScore}점(표준 95점 필요${overallScore < 90 ? ", 예외 90점 필요" : ""})`);
  if (!shortfalls.length) return [];
  return [{ category: "readability", message: `품질 승인 기준: 전체 95점 이상, 검색 의도·SEO·가독성·정보 완성도 각각 95점 이상, 기타 점수 항목 각각 80점 이상. 현재 미달: ${shortfalls.join(", ")}.` }];
}

function normalizeTasks(value: unknown, dimensions: readonly QualityDimensionResult[]) {
  if (Array.isArray(value)) {
    const tasks = value.flatMap((item) => isRecord(item) && categories.includes(item.category as QualityCategory) && typeof item.message === "string" && item.message.trim() ? [{ category: item.category as QualityCategory, message: item.message.trim() }] : []);
    if (tasks.length) return tasks;
  }
  return dimensions.flatMap((dimension) => dimension.tasks.map((message) => ({ category: dimension.category, message })));
}
function qualityLabel(category: QualityCategory) { return ({ searchIntent: "검색 의도", seo: "SEO", readability: "가독성", structure: "콘텐츠 구조", completeness: "정보 완성도", usefulness: "정보 유용성", htmlQuality: "HTML 품질", imageStrategy: "이미지 전략", internalLinks: "내부 링크", cta: "CTA" })[category]; }
function empty(status: QualityUiStatus): NormalizedQualityReview { return Object.freeze({ dimensions: Object.freeze([]), overallScore: null, approvalType: "none", status, revisionId: null, reviewedAt: null, issues: Object.freeze([]), actionableTasks: Object.freeze([]) }); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function score(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
