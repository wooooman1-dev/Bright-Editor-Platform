import {
  evaluateApprovalPreparationText,
  evaluateApprovalReadiness,
  type ApprovalReadinessReport,
} from "../approval";
import { canonicalDocumentText, type ContentDocument } from "../content";
import {
  QualityEngine as BaseQualityEngine,
  isStandardQualityApproved as isBaseStandardQualityApproved,
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
 * Approval preparation adds a separate deterministic readiness report without
 * adding another AI call. Approval-readiness findings must never rewrite the
 * standard manuscript Quality approval. A standard Quality score, including
 * 100, never means the whole site is application-ready.
 */
export class QualityEngine extends BaseQualityEngine {
  review(document: ContentDocument, context: QualityReviewContext = {}): QualityReport {
    const report = super.review(document, context);
    const snapshot = document.metadata?.approvalPolicy;
    if (!snapshot) return report;

    const issues = evaluateApprovalPreparationText(canonicalDocumentText(document), snapshot);
    const standardQualityApproved = isBaseStandardQualityApproved(report);
    const approvalReadiness = evaluateApprovalReadiness(document, issues, standardQualityApproved);

    return Object.freeze({
      ...report,
      approvalReadiness,
    }) as QualityReport;
  }
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
