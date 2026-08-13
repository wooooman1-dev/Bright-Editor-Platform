import {
  deriveApprovalReadinessReport,
  evaluateGeneratedClaimVerificationIntegrity,
  isCriticalVerificationClaim,
  type ApprovalReadinessReport,
} from "../approval";
import {
  analyzeEditorialMarkupIntegrity,
  type ContentDocument,
} from "../content";
import {
  QualityEngine as BaseQualityEngine,
  editorialRevisionId,
  isStandardQualityApproved as isBaseStandardQualityApproved,
  type QualityDimensionResult,
  type QualityReport,
  type QualityReviewContext,
} from "./QualityEngine";
import { qualityDimensionWeights } from "./QualityScoringPolicy";

export type ApprovalAwareQualityReport = QualityReport & Readonly<{
  approvalReadiness?: ApprovalReadinessReport;
}>;

/**
 * Public policy entry point.
 *
 * Quality scoring is implemented by the platform-independent base engine and is
 * based on intent alignment, information sufficiency, safety, structure, and
 * usefulness. Prose character counts remain telemetry only.
 *
 * Approval preparation adds a separate deterministic readiness report without
 * adding another AI call. Approval-readiness findings must never rewrite the
 * standard manuscript Quality approval. A standard Quality score, including
 * 100, never means the whole site is application-ready.
 */
export class QualityEngine extends BaseQualityEngine {
  review(document: ContentDocument, context: QualityReviewContext = {}): ApprovalAwareQualityReport {
    const integrityReport = applyEditorialMarkupIntegrity(super.review(document, context), document);
    const report = applyGeneratedClaimVerificationIntegrity(integrityReport, document, context);

    /**
     * The readiness aggregate is derived, not authored here. Quality Review has
     * no site audit, no source fetch and no public-post catalog, so computing
     * the five non-quality checks with its own copy of the rules could only
     * re-report the stored snapshots — and, when it disagreed with the
     * readiness service, silently overwrite that service's verdict.
     */
    const approvalReadiness = deriveApprovalReadinessReport({
      document,
      ...(context.opportunity ? { opportunity: context.opportunity } : {}),
      standardQualityApproved: isBaseStandardQualityApproved(report),
      standardQualityBlockingReasons: standardQualityBlockingReasons(report),
    });
    if (!approvalReadiness) return report;

    return Object.freeze({
      ...report,
      approvalReadiness,
    });
  }
}

/**
 * The Standard Quality tasks that are currently blocking approval.
 *
 * The approval-readiness card owns the "what do I do next?" answer for the
 * manuscript-quality state, but the reasons live here. Measured on the
 * 밝은재테크 corpus, 8 of 19 reviewed approval manuscripts were blocked and 5 of
 * those 8 scored 100 on every scored dimension, so neither the score panel nor
 * the readiness card named the actual blocker. One function so every caller
 * derives the same list.
 */
export function standardQualityBlockingReasons(
  report: Pick<QualityReport, "tasks"> | undefined,
): readonly string[] {
  return Object.freeze([...new Set((report?.tasks ?? [])
    .filter((task) => task.status === "blocked")
    .map((task) => task.message.trim())
    .filter(Boolean))]);
}

/**
 * Standard manuscript Quality Gate.
 *
 * This intentionally ignores AdSense application readiness. Draft preparation,
 * editor Quality status, and standard publishing safety use this function.
 */
export function isApprovalAwareStandardQualityApproved(
  report: Pick<QualityReport, "approved" | "approvalType"> & Partial<ApprovalAwareQualityReport>,
): boolean {
  return isBaseStandardQualityApproved(report);
}

/**
 * Site-level AdSense application readiness Gate.
 *
 * Use this only when deciding whether the whole site is ready for an AdSense
 * application. It must not be used as the manuscript Quality approval helper.
 */
export function isApprovalApplicationReady(
  report: Pick<QualityReport, "approved" | "approvalType"> & Partial<ApprovalAwareQualityReport>,
): boolean {
  if (!isBaseStandardQualityApproved(report)) return false;
  const readiness = report.approvalReadiness;
  return readiness ? readiness.applicationReady === true : true;
}

function applyGeneratedClaimVerificationIntegrity(
  report: QualityReport,
  document: ContentDocument,
  context: QualityReviewContext,
): QualityReport {
  const plan = context.opportunity?.verificationPlan;
  const criticalPlan = plan?.claims.some(isCriticalVerificationClaim) ? plan : undefined;
  if (!criticalPlan && !document.metadata?.generatedFactualClaimInventory) return report;

  const integrity = evaluateGeneratedClaimVerificationIntegrity({
    document,
    plan: criticalPlan,
    currentRevisionId: context.revisionId ?? editorialRevisionId(document),
  });
  const uniqueIssues = integrity.reasons;
  if (!uniqueIssues.length) return report;

  const task = "검증되지 않은 고위험 사실을 제거하거나 현재 VerificationSnapshot에서 검증된 Claim 값으로 수정한 뒤 Quality Review를 다시 실행하세요.";
  return Object.freeze({
    ...report,
    approved: false,
    approvalType: "none" as const,
    approvalState: "blocked" as const,
    findings: Object.freeze([
      ...report.findings,
      ...uniqueIssues.map((message) => ({
        category: "searchIntent" as const,
        message,
        severity: "error" as const,
      })),
    ]),
    tasks: Object.freeze([
      ...report.tasks,
      ...uniqueIssues.map((message) => ({
        category: "searchIntent" as const,
        message: `${message} ${task}`,
        status: "blocked" as const,
      })),
    ]),
  });
}

function applyEditorialMarkupIntegrity(report: QualityReport, document: ContentDocument): QualityReport {
  const issues = analyzeEditorialMarkupIntegrity(document);
  if (!issues.length) return report;

  const codes = [...new Set(issues.map((issue) => issue.code))];
  const reason = `독자에게 노출되는 원고에 지원하지 않는 마크업이 남아 있습니다: ${codes.join(", ")}.`;
  const task = "Markdown 링크·이미지, 깨진 링크 문법, HTML 태그 또는 코드 펜스를 제거하고 정식 Content block으로 표현하세요.";
  const dimensions = Object.freeze(report.dimensions.map((dimension): QualityDimensionResult => {
    if (dimension.category !== "htmlQuality") return dimension;
    const reasons = dimension.reasons.filter((message) => message !== "모든 정의된 검사 기준을 통과했습니다.");
    return Object.freeze({
      ...dimension,
      score: 0,
      status: "blocked" as const,
      evaluation: "evaluated" as const,
      reasons: Object.freeze([...reasons, reason]),
      tasks: Object.freeze([...dimension.tasks, task]),
      evidence: Object.freeze([
        ...dimension.evidence,
        { signal: "editorialMarkupIssueCount", value: issues.length },
        { signal: "editorialMarkupIssueCodes", value: codes.join(",") },
      ]),
    });
  }));
  const scoringWeight = Object.values(qualityDimensionWeights).reduce((sum, weight) => sum + weight, 0);
  const overallScore = Math.round(dimensions.reduce(
    (sum, dimension) => sum + dimension.score * qualityDimensionWeights[dimension.category],
    0,
  ) / scoringWeight);

  return Object.freeze({
    ...report,
    approved: false,
    approvalType: "none" as const,
    approvalState: "blocked" as const,
    overallScore,
    reviews: dimensions,
    dimensions,
    findings: Object.freeze([
      ...report.findings,
      { category: "htmlQuality" as const, message: reason, severity: "error" as const },
    ]),
    tasks: Object.freeze([
      ...report.tasks,
      { category: "htmlQuality" as const, message: task, status: "blocked" as const },
    ]),
  });
}
