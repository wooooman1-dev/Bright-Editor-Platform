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
  /**
   * 승인용 원고에서만 판정한다.
   *
   * 이 게이트는 조건이 "CRITICAL Claim 이 있는가" 또는 "인벤토리가 있는가"
   * 뿐이라 콘텐츠 종류를 묻지 않았다. 그래서 일반 콘텐츠도 기획에 CRITICAL
   * Claim 이 하나 잡히면 여기로 들어왔고, 걸리면 아래에서 `approved: false` 로
   * 승인을 강제로 껐다 — 점수가 100 이어도. "1년" 같은 표현 하나로 일반 글이
   * 막히던 경로가 이것이다.
   *
   * 승인 정책 스냅샷은 승인용 원고에만 붙으므로, 승인 준비 리포트가 자기
   * 적용 여부를 판단할 때 쓰는 것과 같은 신호를 쓴다.
   */
  if (!document.metadata?.approvalPolicy) return report;
  const plan = context.opportunity?.verificationPlan;
  const criticalPlan = plan?.claims.some(isCriticalVerificationClaim) ? plan : undefined;
  if (!criticalPlan && !document.metadata?.generatedFactualClaimInventory) return report;

  const integrity = evaluateGeneratedClaimVerificationIntegrity({
    document,
    plan: criticalPlan,
    currentRevisionId: context.revisionId ?? editorialRevisionId(document),
  });
  // 차단 사유와 경고를 같은 자리에 낸다. 경고 문장은 어떤 값이 어디에서 걸렸는지를
  // 이미 담고 있으므로 이유가 화면에 그대로 보인다 (D-045).
  const uniqueIssues = Object.freeze([...new Set([...integrity.reasons, ...integrity.warnings])]);
  if (!uniqueIssues.length) return report;

  /**
   * 기록하되 막지 않는다.
   *
   * 이 검사는 "출처에서 확인한 값과 본문이 같은가"를 앵커로 확인하는 장치다.
   * 출처 내용 대조를 하지 않기로 한 이상 대조할 기준값이 없고, 근거 없이
   * 승인을 끄면 통과할 수 없는 관문이 된다. 2026-08-14 실측: 승인 대기 12편 중
   * 7편이 여기서 막혔고 그중 다수가 모든 항목 100점이었다. "1년" 한 단어가
   * 원인인 경우도 있었다.
   *
   * 진단은 남긴다. 어떤 Claim 이 본문에서 사라졌는지는 나중에 볼 값어치가
   * 있고, 남겨 두면 판정을 되돌릴 때 근거가 된다.
   */
  const task = "생성이 기록한 Claim과 현재 본문이 어긋납니다. 발행을 막지는 않으나 값이 바뀌었는지 확인하세요.";
  return Object.freeze({
    ...report,
    findings: Object.freeze([
      ...report.findings,
      ...uniqueIssues.map((message) => ({
        category: "searchIntent" as const,
        message,
        severity: "warning" as const,
      })),
    ]),
    tasks: Object.freeze([
      ...report.tasks,
      ...uniqueIssues.map((message) => ({
        category: "searchIntent" as const,
        message: `${message} ${task}`,
        status: "action_required" as const,
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
