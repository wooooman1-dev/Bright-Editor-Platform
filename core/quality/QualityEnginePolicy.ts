import {
  evaluateApprovalPreparationText,
  evaluateApprovalReadiness,
  type ApprovalPreparationIssueCode,
  type ApprovalReadinessReport,
} from "../approval";
import { canonicalDocumentText, type ContentDocument } from "../content";
import {
  QualityEngine as BaseQualityEngine,
  isStandardQualityApproved as isBaseStandardQualityApproved,
  type QualityCategory,
  type QualityReport,
  type QualityReviewContext,
} from "./QualityEngine";

type ApprovalAwareQualityReport = QualityReport & Readonly<{
  approvalReadiness?: ApprovalReadinessReport;
}>;

/**
 * Public policy entry point.
 *
 * Quality scoring is implemented by the platform-independent base engine and is
 * based on intent alignment, information sufficiency, safety, structure, and
 * usefulness. Prose character counts remain telemetry only.
 *
 * Approval preparation adds deterministic policy findings and a separate
 * approval-readiness report without adding another AI call. A standard Quality
 * score, including 100, never means the whole site is application-ready.
 */
export class QualityEngine extends BaseQualityEngine {
  review(document: ContentDocument, context: QualityReviewContext = {}): QualityReport {
    const report = super.review(document, context);
    const snapshot = document.metadata?.approvalPolicy;
    if (!snapshot) return report;

    const issues = evaluateApprovalPreparationText(canonicalDocumentText(document), snapshot);
    const standardQualityApproved = isBaseStandardQualityApproved(report);
    const approvalReadiness = evaluateApprovalReadiness(document, issues, standardQualityApproved);

    if (!issues.length) {
      return Object.freeze({
        ...report,
        approvalReadiness,
      }) as QualityReport;
    }

    const findings = issues.map((issue) => ({
      category: approvalIssueCategory(issue.code),
      message: `[승인 준비 정책] ${issue.message}`,
      severity: "error" as const,
    }));
    const tasks = issues.map((issue) => ({
      category: approvalIssueCategory(issue.code),
      message: `[승인 준비 정책] ${issue.message}`,
      status: "blocked" as const,
    }));

    return Object.freeze({
      ...report,
      approved: false,
      approvalType: "none" as const,
      approvalState: "blocked" as const,
      findings: Object.freeze([...report.findings, ...findings]),
      tasks: Object.freeze([...report.tasks, ...tasks]),
      approvalReadiness,
    }) as QualityReport;
  }
}

/**
 * Runtime readiness Gate used by application and publishing workflows.
 * Standard content keeps the existing Quality approval behavior. Approval-mode
 * content additionally requires every independent AdSense readiness check.
 */
export function isApprovalAwareStandardQualityApproved(
  report: Pick<QualityReport, "approved" | "approvalType"> & Partial<ApprovalAwareQualityReport>,
): boolean {
  if (!isBaseStandardQualityApproved(report)) return false;
  const readiness = report.approvalReadiness;
  return readiness ? readiness.applicationReady === true : true;
}

function approvalIssueCategory(code: ApprovalPreparationIssueCode): QualityCategory {
  switch (code) {
    case "PROFILE_SOURCE_REQUIREMENT_MISSING":
    case "PROFILE_SOURCE_URL_MISSING":
    case "PROFILE_REVIEW_DATE_MISSING":
    case "PLACEHOLDER_CONTENT":
      return "completeness";
    default:
      return "searchIntent";
  }
}
