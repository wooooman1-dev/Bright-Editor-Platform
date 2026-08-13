import type { ContentDocument } from "../content/ContentDocument";
import type { ContentOpportunityCandidate } from "../content/ContentOpportunity";
import { canonicalDocumentText } from "../content/ContentMetrics";
import {
  resolveApprovalEvidenceRequirement,
  resolveApprovalTemporalRequirement,
} from "./ApprovalEvidenceRequirement";
import { evaluateApprovalPreparationText } from "./ApprovalPolicy";
import {
  evaluateApprovalReadiness,
  withCurrentApprovalInspectionContract,
  withPendingStandardQualityGuidance,
  type ApprovalReadinessReport,
} from "./ApprovalReadiness";

export type ApprovalReadinessOpportunity =
  Pick<ContentOpportunityCandidate, "verificationPlan" | "requiredEvidenceContract">;

/**
 * The one implementation of the six-check approval-readiness aggregate.
 *
 * The aggregate is derived state: it is a pure function of the manuscript, the
 * inspection snapshots stored on it (Evidence pack, duplicate check, internal
 * link catalog status, site audit), the Planning verification contract, and the
 * separate Standard Quality verdict. Nothing here fetches, audits, or calls AI.
 *
 * It exists because the aggregate used to be computed independently by the
 * Quality engine and by the readiness application service, and the two answers
 * were persisted into two different places (`contents[].quality` and
 * `qualityReports[].report`). They drifted: the same article was recorded as
 * `site_readiness: not_evaluated` in one copy and `site_readiness: passed` in
 * the other. Deriving both copies from this single function removes the drift
 * by construction rather than by keeping two writers in sync.
 *
 * Standard Quality approval stays an input, never an output. A manuscript that
 * scores 100 still reports Evidence, duplicate, internal-link and site
 * readiness as their own separate states.
 */
export function deriveApprovalReadinessReport(input: Readonly<{
  document: ContentDocument;
  opportunity?: ApprovalReadinessOpportunity;
  standardQualityApproved: boolean;
  /**
   * True when the Standard Quality report belongs to an earlier revision of
   * this manuscript. It lets the aggregate distinguish "quality is not good
   * enough" from "the manuscript changed after its last review", which need
   * different next actions. Callers compute it because the revision hash lives
   * in the Quality module, which already depends on this one.
   */
  supersededQualityReview?: boolean;
  /**
   * Verbatim Standard Quality tasks that are blocking approval right now.
   *
   * Callers supply them because the task list lives in the Quality module, which
   * already depends on this one. Passing them keeps the "why is quality
   * blocked?" answer inside the readiness card the user is actually looking at.
   */
  standardQualityBlockingReasons?: readonly string[];
}>): ApprovalReadinessReport | undefined {
  const policy = input.document.metadata?.approvalPolicy;
  if (!policy) return undefined;

  const evidence = input.document.metadata?.approvalEvidence;
  const evidenceRequirement = resolveApprovalEvidenceRequirement(input.opportunity);
  const temporalRequirement = resolveApprovalTemporalRequirement(input.opportunity);
  const issues = evaluateApprovalPreparationText(
    canonicalDocumentText(input.document),
    policy,
    {
      sourceUrls: evidence?.sources
        .filter((source) => source.provenance !== "search_candidate")
        .map((source) => source.canonicalUrl ?? source.url),
      reviewedAt: evidence?.reviewedAt,
      coverageStatus: evidence?.coverageStatus ?? evidence?.status,
      requiredFactFields: evidence?.requiredFactFields,
      verifiedFactFields: evidence?.verifiedFactFields,
      unverifiedFactFields: evidence?.unverifiedFactFields,
      evidenceRequired: evidenceRequirement === "required",
      timeSensitiveEvidenceRequired: temporalRequirement === "required",
    },
  );

  const report = withCurrentApprovalInspectionContract(
    evaluateApprovalReadiness(
      input.document,
      issues,
      input.standardQualityApproved,
      evidenceRequirement !== "not_required",
      input.supersededQualityReview === true,
      input.standardQualityBlockingReasons ?? [],
    ),
    input.document,
  );
  return input.standardQualityApproved
    ? report
    : withPendingStandardQualityGuidance(report);
}
