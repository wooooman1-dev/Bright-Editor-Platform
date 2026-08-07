import { canonicalizeApprovalEvidenceUrl } from "../approval";
import type { VerificationSnapshot } from "../approval/VerificationClaim";
import {
  evaluateVerificationGenerationGate,
  type VerificationGenerationGateResult,
  type VerificationGenerationPlan,
} from "../approval/VerificationGenerationGate";
import type { AIWebSource } from "./AIProvider";
import {
  ApprovalSourcePreflightError,
  type ApprovalSourcePreflightClaimSource,
} from "./ApprovalSourcePreflight";

export type VerificationGenerationBundle = Readonly<{
  gate: VerificationGenerationGateResult;
  sources: readonly AIWebSource[];
  claimSources: readonly ApprovalSourcePreflightClaimSource[];
}>;

/**
 * Converts the diagnostic-rich explicit preflight result into the only evidence
 * bundle that Generation is allowed to see.
 */
export function requireExplicitVerificationGenerationBundle(input: Readonly<{
  plan: VerificationGenerationPlan;
  snapshot?: VerificationSnapshot;
  sources: readonly AIWebSource[];
  claimSources: readonly ApprovalSourcePreflightClaimSource[];
}>): VerificationGenerationBundle {
  const gate = evaluateVerificationGenerationGate({
    plan: input.plan,
    snapshot: input.snapshot,
  });
  if (!gate.ready) {
    const claims = gate.blockingClaimIds.length
      ? gate.blockingClaimIds.join(", ")
      : "verification-integrity";
    throw new ApprovalSourcePreflightError(
      `명시적 사실 검증 Gate를 통과하지 못해 원고 생성을 시작하지 않았습니다. 차단 Claim: ${claims}.`,
    );
  }

  const allowedUrls = new Set(
    gate.verifiedCanonicalUrls.map(canonicalizeApprovalEvidenceUrl),
  );
  const sources = Object.freeze(input.sources.filter((source) =>
    allowedUrls.has(canonicalizeApprovalEvidenceUrl(source.url))));
  const claimSources = Object.freeze(input.claimSources.filter((source) =>
    allowedUrls.has(canonicalizeApprovalEvidenceUrl(source.url))));

  if (gate.verifiedClaimIds.length > 0 && (!sources.length || !claimSources.length)) {
    throw new ApprovalSourcePreflightError(
      "검증된 Claim과 Generation 근거 bundle의 연결이 일치하지 않아 원고 생성을 시작하지 않았습니다.",
    );
  }

  return Object.freeze({ gate, sources, claimSources });
}
