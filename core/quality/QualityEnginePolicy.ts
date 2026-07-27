import { evaluateApprovalPreparationText, type ApprovalPreparationIssueCode } from "../approval";
import { canonicalDocumentText, type ContentDocument } from "../content";
import {
  QualityEngine as BaseQualityEngine,
  type QualityCategory,
  type QualityReport,
  type QualityReviewContext,
} from "./QualityEngine";

/**
 * Public policy entry point.
 *
 * Quality scoring is implemented by the platform-independent base engine and is
 * based on intent alignment, information sufficiency, safety, structure, and
 * usefulness. Prose character counts remain telemetry only.
 *
 * Approval preparation adds deterministic blocking findings without changing
 * the existing score calculation or adding another AI call.
 */
export class QualityEngine extends BaseQualityEngine {
  review(document: ContentDocument, context: QualityReviewContext = {}): QualityReport {
    const report = super.review(document, context);
    const snapshot = document.metadata?.approvalPolicy;
    if (!snapshot) return report;

    const issues = evaluateApprovalPreparationText(canonicalDocumentText(document), snapshot);
    if (!issues.length) return report;

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
    });
  }
}

function approvalIssueCategory(code: ApprovalPreparationIssueCode): QualityCategory {
  return code === "PROFILE_SOURCE_REQUIREMENT_MISSING" || code === "PLACEHOLDER_CONTENT"
    ? "completeness"
    : "searchIntent";
}
