import type {
  VerificationClaimSpec,
  VerificationSnapshot,
} from "./VerificationClaim";
import {
  verificationPlanFingerprint,
  verificationSnapshotFingerprint,
} from "./VerificationClaimFingerprint";
import { isCriticalVerificationClaim } from "./VerificationClaim";

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
 * It revalidates the plan and snapshot fingerprints, rejects unknown or duplicated
 * results, and exposes every recorded assessment URL as citable Generation evidence.
 *
 * D-045 이후 이 게이트는 Claim 내용 판정을 하지 않는다. 판정 근거였던
 * evaluateVerificationClaim 재검사와 supports/fresh 기반 assessment 선별은 모두
 * 페이지 내용과 원고를 대조하는 검사였다. 남은 것은 저장된 Snapshot이 지금 계획과
 * 같은 것인지를 확인하는 구조 검사뿐이다.
 */
export function evaluateVerificationGenerationGate(input: Readonly<{
  plan: VerificationGenerationPlan;
  snapshot?: VerificationSnapshot;
}>): VerificationGenerationGateResult {
  const diagnostics: string[] = [];
  const requiredClaimIds = input.plan.claims
    .filter(isCriticalVerificationClaim)
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

  // D-045: 출처 판정은 인용 범위 안의 도메인인지와 그 주소에 실제로 닿는지까지다.
  // 페이지 내용이 Claim을 뒷받침하는지는 더 이상 판정하지 않는다. 그래서 이 게이트는
  // Claim별 내용 상태로 막지 않고, 구조 무결성(지문·중복·미지의 결과)만 본다.
  for (const claim of input.plan.claims) {
    if (!isCriticalVerificationClaim(claim)) continue;
    const result = resultByClaimId.get(claim.claimId);
    if (!result) continue;
    verifiedClaimIds.push(claim.claimId);
    for (const assessment of result.sourceAssessments) {
      const canonicalUrl = assessment.canonicalUrl?.trim();
      if (!canonicalUrl) continue;
      verifiedSourceIds.add(assessment.sourceId);
      verifiedCanonicalUrls.add(canonicalUrl);
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
