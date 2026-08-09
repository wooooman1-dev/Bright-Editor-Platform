import type { ContentOpportunityCandidate } from "../content/ContentOpportunity";
import { isCriticalVerificationClaim } from "./VerificationClaim";

export type ApprovalEvidenceRequirement = "required" | "not_required" | "unknown";

/**
 * Canonical risk-based Evidence applicability.
 *
 * Legacy content remains fail-closed unless its stored Planning contract proves
 * that no mandatory Claim exists. VERIFY-only plans never require mandatory
 * Evidence, while any CRITICAL Claim or legacy required Claim remains required.
 */
export function resolveApprovalEvidenceRequirement(
  opportunity: Pick<ContentOpportunityCandidate, "verificationPlan" | "requiredEvidenceContract"> | undefined,
): ApprovalEvidenceRequirement {
  if (!opportunity) return "unknown";

  const plan = opportunity.verificationPlan;
  if (plan) {
    return plan.claims.some(isCriticalVerificationClaim) ? "required" : "not_required";
  }

  const contract = opportunity.requiredEvidenceContract;
  if (!contract) return "unknown";
  if (contract.explicitVerificationRequired
    || contract.requiredClaims.length > 0) {
    return "required";
  }
  return "not_required";
}

export function approvalEvidenceIsApplicable(
  opportunity: Pick<ContentOpportunityCandidate, "verificationPlan" | "requiredEvidenceContract"> | undefined,
): boolean {
  return resolveApprovalEvidenceRequirement(opportunity) !== "not_required";
}
