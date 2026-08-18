import {
  approvalReadinessCheckKeys,
  type ApprovalReadinessCheck,
  type ApprovalReadinessReport,
} from "../../core/approval";
import type { QualityApprovalType, QualityCategory, QualityDimensionResult } from "../../core/quality";

const categories: readonly QualityCategory[] = ["searchIntent", "seo", "readability", "structure", "completeness", "usefulness", "htmlQuality", "imageStrategy", "internalLinks", "cta"];
const scoringCategories = new Set<QualityCategory>(["searchIntent", "seo", "readability", "structure", "completeness", "usefulness", "htmlQuality", "imageStrategy"]);
const editorialTargets = new Set<QualityCategory>(["searchIntent", "seo", "readability", "completeness"]);
const evidenceLabels: Readonly<Record<string, string>> = Object.freeze({
  characters: "본문 글자 수",
  minimumCharacters: "최소 권장 글자 수",
  headingCount: "소제목 수",
  requiredSections: "필수 섹션 수",
  paragraphCount: "문단 수",
  shortParagraphs: "짧은 문단 수",
  singleSentenceParagraphs: "한 문장 문단 수",
  singleSentenceThreshold: "허용 한 문장 문단 수",
  singleSentenceExcess: "허용 기준 초과 한 문장 문단 수",
  excessiveSentenceParagraphs: "문장이 너무 많은 문단 수",
  repeatedOpenings: "반복되는 문단 도입부",
  clicheCount: "상투적 표현 수",
  semanticHeadingOverlapCount: "의미가 겹치는 소제목 수",
  repeatedCoreAdviceCount: "반복되는 핵심 조언 수",
  vagueInstructionCount: "모호한 안내 표현 수",
  concreteCriteriaCount: "구체적인 시간·횟수·단계 기준 수",
  practicalToolSignals: "체크리스트·기록·단계 안내 수",
  placeholderDetected: "임시 문구 감지",
  unsupportedClaimSignal: "근거 없는 주장 감지",
  fabricatedExperienceRisk: "허위 경험 표현 위험",
  planningLanguageDetected: "기획·작성 지시 문구 감지",
  editorialInstructionCount: "편집자용 지시 문구 수",
  duplicateHeadingCount: "중복 소제목 수",
  emptyHeadings: "빈 소제목 수",
  shallowSections: "설명이 얕은 섹션 수",
  duplicateBlockIds: "중복 블록 ID 수",
  emptyParagraphs: "빈 문단 수",
  invalidButtonUrls: "유효하지 않은 링크 수",
  targetPolicyViolations: "링크 열기 정책 위반 수",
  keywordOccurrences: "대표 키워드 사용 횟수",
  imageCount: "이미지 수",
  buttonCount: "버튼 수",
  contextualInternalLinkCount: "본문 내부 링크 수",
  relatedPostCount: "관련 글 수",
  availableInternalLinkCandidates: "사용 가능한 내부 링크 후보 수",
  placedContextualInternalLinks: "배치된 본문 내부 링크 수",
  placedRelatedPosts: "배치된 관련 글 수",
  availableSameCategoryCandidates: "같은 카테고리 후보 수",
  categoryName: "티스토리 카테고리",
  catalogStatus: "공개 글 카탈로그 상태",
  scoringExcluded: "품질 점수 제외",
  placedCtaBlocks: "배치된 CTA 수",
});
const countSignals = new Set([
  "headingCount", "requiredSections", "paragraphCount", "shortParagraphs", "singleSentenceParagraphs", "singleSentenceThreshold",
  "singleSentenceExcess", "excessiveSentenceParagraphs", "repeatedOpenings", "clicheCount",
  "semanticHeadingOverlapCount", "repeatedCoreAdviceCount", "vagueInstructionCount", "concreteCriteriaCount",
  "practicalToolSignals", "editorialInstructionCount", "duplicateHeadingCount", "emptyHeadings", "shallowSections",
  "duplicateBlockIds", "emptyParagraphs", "invalidButtonUrls", "targetPolicyViolations", "keywordOccurrences", "imageCount",
  "buttonCount", "contextualInternalLinkCount", "relatedPostCount", "availableInternalLinkCandidates",
  "placedContextualInternalLinks", "placedRelatedPosts", "availableSameCategoryCandidates", "placedCtaBlocks",
]);

export type QualityUiStatus = "no_review" | "loading" | "error" | "not_evaluated" | "stale" | "improvement_required" | "ready";
export type NormalizedQualityReview = Readonly<{
  dimensions: readonly QualityDimensionResult[];
  overallScore: number | null;
  approvalType: QualityApprovalType;
  approvalReadiness: ApprovalReadinessReport | null;
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
  const parsedDimensions = rawDimensions ? rawDimensions.flatMap(normalizeDimension) : [];
  const canonicalDimensions = Boolean(rawDimensions && parsedDimensions.length === rawDimensions.length && parsedDimensions.length > 0);
  if (!canonicalDimensions) return empty("not_evaluated");

  const revisionId = text(value.reviewedRevisionId);
  const reviewedAt = text(value.reviewedAt);
  const overallScore = score(value.overallScore);
  if (!revisionId || !reviewedAt || overallScore === null) return { ...empty("not_evaluated"), dimensions: Object.freeze(parsedDimensions) };

  const approvalReadiness = normalizeApprovalReadiness(value.approvalReadiness);
  const dimensions = parsedDimensions;
  const dimensionIssues = dimensions.flatMap((dimension) => dimension.reasons);
  const stale = Boolean(context.currentRevisionId && revisionId !== context.currentRevisionId);
  const notEvaluated = dimensions.some((dimension) => dimension.status === "blocked" && dimension.evaluation === "not_evaluated");
  const approved = value.approved === true;
  const approvalType: QualityApprovalType = value.approvalType === "exception" ? "exception" : value.approvalType === "standard" ? "standard" : "none";
  const standardApproved = approved && approvalType === "standard";
  const status: QualityUiStatus = stale
    ? "stale"
    : notEvaluated
      ? "not_evaluated"
      : standardApproved
        ? "ready"
        : "improvement_required";
  const approvalTasks = standardApproved || stale || notEvaluated ? [] : qualityApprovalTasks(dimensions, overallScore);
  const actionableTasks = [...approvalTasks, ...normalizeTasks(value.tasks, dimensions)];
  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    overallScore,
    approvalType,
    approvalReadiness,
    status,
    revisionId,
    reviewedAt,
    issues: Object.freeze(dimensionIssues),
    actionableTasks: Object.freeze(actionableTasks),
  });
}

function normalizeDimension(value: unknown): QualityDimensionResult[] {
  if (!isRecord(value) || !categories.includes(value.category as QualityCategory)) return [];
  const normalizedScore = score(value.score);
  if (normalizedScore === null || !["ready", "needs_improvement", "blocked"].includes(String(value.status)) || !["evaluated", "not_evaluated"].includes(String(value.evaluation))) return [];
  const category = value.category as QualityCategory;
  const rawEvidence = Array.isArray(value.evidence) ? value.evidence : [];
  return [Object.freeze({
    category,
    score: normalizedScore,
    status: value.status as QualityDimensionResult["status"],
    evaluation: value.evaluation as QualityDimensionResult["evaluation"],
    reasons: Object.freeze(normalizeReasons(category, value.reasons, rawEvidence)),
    tasks: Object.freeze(strings(value.tasks)),
    evidence: Object.freeze(rawEvidence.flatMap(normalizeEvidence)),
  })];
}

function normalizeApprovalReadiness(value: unknown): ApprovalReadinessReport | null {
  if (!isRecord(value) || !["ready", "needs_review", "blocked"].includes(String(value.status)) || typeof value.applicationReady !== "boolean" || !Array.isArray(value.checks)) return null;
  const checks = value.checks.flatMap(normalizeApprovalReadinessCheck);
  if (checks.length !== value.checks.length || checks.length !== approvalReadinessCheckKeys.length) return null;
  return Object.freeze({
    status: value.status as ApprovalReadinessReport["status"],
    applicationReady: value.applicationReady,
    checks: Object.freeze(checks),
  });
}

function normalizeApprovalReadinessCheck(value: unknown): ApprovalReadinessCheck[] {
  if (!isRecord(value)
    || !approvalReadinessCheckKeys.includes(value.key as ApprovalReadinessCheck["key"])
    || !["passed", "needs_review", "blocked", "not_evaluated"].includes(String(value.status))
    || typeof value.message !== "string"
    || !value.message.trim()) return [];
  return [Object.freeze({
    key: value.key as ApprovalReadinessCheck["key"],
    status: value.status as ApprovalReadinessCheck["status"],
    message: value.message.trim(),
    ...(value.applicable === false ? { applicable: false } : {}),
    ...(typeof value.action === "string" && value.action.trim() ? { action: value.action.trim() } : {}),
  })];
}

/**
 * Every readiness check is shown, including the ones that do not apply.
 *
 * A non-applicable Evidence check used to be dropped here, so the Evidence card
 * disappeared from the panel entirely — measured on the 밝은재테크 corpus that
 * was 8 of 16 approval manuscripts, including manuscripts whose stored factual
 * inventory shows sentences were withdrawn because their source anchor failed.
 * AGENTS.md ch.14 lists Evidence Verification as one of the four shared approval
 * states and requires it to be represented separately, so it is rendered with
 * its own "not applicable" label instead of being hidden.
 */
export function visibleApprovalReadinessChecks(
  report: ApprovalReadinessReport,
): readonly ApprovalReadinessCheck[] {
  return report.checks;
}

export function approvalReadinessCheckStatusLabel(check: ApprovalReadinessCheck): string {
  if (check.applicable === false) return "필수 검증 대상 아님";
  if (check.status === "passed") return "통과";
  if (check.status === "blocked") return "차단";
  return check.status === "needs_review" ? "검토 필요" : "미검사";
}

export function approvalReadinessCheckStatusTone(check: ApprovalReadinessCheck): string {
  if (check.applicable === false) return "text-[#66666f]";
  if (check.status === "passed") return "text-emerald-700";
  return check.status === "blocked" ? "text-red-700" : "text-amber-800";
}

function normalizeReasons(category: QualityCategory, value: unknown, evidence: readonly unknown[]): string[] {
  const reasons = strings(value);
  if (category !== "internalLinks") return reasons;

  const contextualCount = numericEvidence(evidence, "placedContextualInternalLinks");
  const relatedCount = numericEvidence(evidence, "placedRelatedPosts");
  if (contextualCount + relatedCount === 0) return reasons;

  const staleCatalogReason = (reason: string) => reason.includes("카테고리가 확인되지 않아 내부 링크 자동 배치를 생략")
    || reason.includes("공개 글 카탈로그를 불러오지 못해 내부 링크 자동 배치를 완료하지 못");
  const filtered = reasons.filter((reason) => !staleCatalogReason(reason));
  if (filtered.length !== reasons.length) {
    filtered.unshift(`본문 내부 링크 ${contextualCount}개와 관련 글 ${relatedCount}개가 배치되어 있습니다.`);
  }
  return filtered;
}

function numericEvidence(evidence: readonly unknown[], signal: string): number {
  const match = evidence.find((item) => isRecord(item) && item.signal === signal && typeof item.value === "number");
  return isRecord(match) && typeof match.value === "number" ? match.value : 0;
}

function normalizeEvidence(value: unknown): QualityDimensionResult["evidence"] {
  if (!isRecord(value) || typeof value.signal !== "string" || !["string", "number", "boolean"].includes(typeof value.value)) return [];
  const signal = value.signal;
  return [Object.freeze({ signal: evidenceLabels[signal] ?? signal, value: formatEvidenceValue(signal, value.value as string | number | boolean) })];
}

function formatEvidenceValue(signal: string, value: string | number | boolean): string | number | boolean {
  if (typeof value === "boolean") return value ? "있음" : "없음";
  if (typeof value !== "number") return value;
  if (signal === "characters" || signal === "minimumCharacters") return `${value.toLocaleString("ko-KR")}자`;
  if (countSignals.has(signal)) return `${value.toLocaleString("ko-KR")}개`;
  return value;
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
    const tasks = value.flatMap((item) => isRecord(item) && categories.includes(item.category as QualityCategory) && typeof item.message === "string" && item.message.trim() && !item.message.startsWith("[승인 준비 정책]") ? [{ category: item.category as QualityCategory, message: item.message.trim() }] : []);
    if (tasks.length) return tasks;
  }
  return dimensions.flatMap((dimension) => dimension.tasks.map((message) => ({ category: dimension.category, message })));
}
function qualityLabel(category: QualityCategory) { return ({ searchIntent: "검색 의도", seo: "SEO", readability: "가독성", structure: "콘텐츠 구조", completeness: "정보 완성도", usefulness: "정보 유용성", htmlQuality: "HTML 품질", imageStrategy: "이미지 전략", internalLinks: "내부 링크", cta: "CTA" })[category]; }
function empty(status: QualityUiStatus): NormalizedQualityReview { return Object.freeze({ dimensions: Object.freeze([]), overallScore: null, approvalType: "none", approvalReadiness: null, status, revisionId: null, reviewedAt: null, issues: Object.freeze([]), actionableTasks: Object.freeze([]) }); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function score(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
