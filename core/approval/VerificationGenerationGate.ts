import type {
  VerificationClaimSpec,
  VerificationSnapshot,
  VerificationSourceAssessment,
} from "./VerificationClaim";
import {
  verificationPlanFingerprint,
  verificationSnapshotFingerprint,
} from "./VerificationClaimFingerprint";

export type VerificationGenerationPlan = Readonly<{
  claims: readonly VerificationClaimSpec[];
  fingerprint: string;
}>;

export type VerificationGenerationGateResult = Readonly<{
  ready: boolean;
  blockingClaimIds: readonly string[];
  verifiedClaimIds: readonly string[];
  verifiedSourceIds: readonly string[];
  verifiedCanonicalUrls: readonly string[];
  diagnostics: readonly string[];
}>;

/**
 * Phase 5A deterministic boundary between explicit Source Preflight and Generation.
 *
 * The gate trusts neither a stored status nor a caller-provided source list by itself.
 * It revalidates the plan/snapshot fingerprints, requires every required Claim to be
 * verified, and exposes only fresh supporting assessments as Generation evidence.
 */
export function evaluateVerificationGenerationGate(input: Readonly<{
  plan: VerificationGenerationPlan;
  snapshot?: VerificationSnapshot;
}>): VerificationGenerationGateResult {
  const diagnostics: string[] = [];
  const requiredClaimIds = input.plan.claims
    .filter((claim) => claim.required)
    .map((claim) => claim.claimId);

  if (verificationPlanFingerprint(input.plan.claims) !== input.plan.fingerprint) {
    return blocked(requiredClaimIds, ["verification_plan_fingerprint_mismatch"]);
  }

  const snapshot = input.snapshot;
  if (!snapshot) {
    return blocked(requiredClaimIds, ["verification_snapshot_missing"]);
  }
  if (snapshot.verificationMode !== "explicit") {
    diagnostics.push("verification_snapshot_mode_mismatch");
  }
  if (snapshot.claimDefinitionFingerprint !== input.plan.fingerprint) {
    diagnostics.push("verification_claim_definition_fingerprint_mismatch");
  }
  const expectedSnapshotFingerprint = verificationSnapshotFingerprint({
    claimDefinitionFingerprint: snapshot.claimDefinitionFingerprint,
    sourceSnapshotFingerprint: snapshot.sourceSnapshotFingerprint,
    results: snapshot.results,
  });
  if (expectedSnapshotFingerprint !== snapshot.verificationSnapshotFingerprint) {
    diagnostics.push("verification_snapshot_fingerprint_mismatch");
  }
  if (diagnostics.length) return blocked(requiredClaimIds, diagnostics);

  const knownClaimIds = new Set(input.plan.claims.map((claim) => claim.claimId));
  const resultByClaimId = new Map<string, VerificationSnapshot["results"][number]>();
  for (const result of snapshot.results) {
    if (!knownClaimIds.has(result.claimId)) {
      diagnostics.push(`verification_unknown_result_claim:${result.claimId}`);
      continue;
    }
    if (resultByClaimId.has(result.claimId)) {
      return blocked(requiredClaimIds, [
        ...diagnostics,
        `verification_duplicate_result_claim:${result.claimId}`,
      ]);
    }
    resultByClaimId.set(result.claimId, result);
  }

  const blockingClaimIds: string[] = [];
  const verifiedClaimIds: string[] = [];
  const verifiedSourceIds = new Set<string>();
  const verifiedCanonicalUrls = new Set<string>();

  for (const claim of input.plan.claims) {
    const result = resultByClaimId.get(claim.claimId);
    if (!result || result.status !== "verified") {
      if (claim.required) blockingClaimIds.push(claim.claimId);
      continue;
    }

    const usable = result.sourceAssessments.filter(isTrustedGenerationAssessment);
    const usableWithUrl = usable.filter((assessment) => Boolean(assessment.canonicalUrl?.trim()));
    if (!usableWithUrl.length) {
      diagnostics.push(`verification_verified_claim_missing_generation_source:${claim.claimId}`);
      if (claim.required) blockingClaimIds.push(claim.claimId);
      continue;
    }

    verifiedClaimIds.push(claim.claimId);
    for (const assessment of usableWithUrl) {
      verifiedSourceIds.add(assessment.sourceId);
      verifiedCanonicalUrls.add(assessment.canonicalUrl!.trim());
    }
  }

  return Object.freeze({
    ready: blockingClaimIds.length === 0,
    blockingClaimIds: Object.freeze([...blockingClaimIds]),
    verifiedClaimIds: Object.freeze([...verifiedClaimIds]),
    verifiedSourceIds: Object.freeze([...verifiedSourceIds]),
    verifiedCanonicalUrls: Object.freeze([...verifiedCanonicalUrls]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function isTrustedGenerationAssessment(
  assessment: VerificationSourceAssessment,
): boolean {
  return assessment.supports === true
    && Boolean(assessment.normalizedValue)
    && assessment.fresh === true
    && assessment.freshnessStatus !== "stale"
    && assessment.freshnessStatus !== "unknown";
}

function blocked(
  blockingClaimIds: readonly string[],
  diagnostics: readonly string[],
): VerificationGenerationGateResult {
  return Object.freeze({
    ready: false,
    blockingClaimIds: Object.freeze([...blockingClaimIds]),
    verifiedClaimIds: Object.freeze([]),
    verifiedSourceIds: Object.freeze([]),
    verifiedCanonicalUrls: Object.freeze([]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}
