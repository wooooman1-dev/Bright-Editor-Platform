import type { ContentDocument } from "../content/ContentDocument";
import {
  bindGeneratedClaims,
  type GeneratedClaimBinding,
  type GeneratedClaimLocation,
} from "./GeneratedClaimBinding";
import { evaluateStoredGeneratedFactualClaims } from "./GeneratedFactualClaim";
import {
  evaluateVerificationGenerationGate,
  type VerificationGenerationPlan,
} from "./VerificationGenerationGate";

export type GeneratedClaimVerificationIntegrityResult = Readonly<{
  passed: boolean;
  reasons: readonly string[];
  bindings: readonly GeneratedClaimBinding[];
  verifiedClaimIds: readonly string[];
  unverifiedDetectedCount: number;
}>;

/**
 * Platform-neutral integrity check shared by Quality and Publishing.
 *
 * The persisted server record is evidence, not authority by itself. Every call
 * re-evaluates the Verification Generation Gate and deterministically rebinds
 * the current canonical manuscript against the persisted VerificationSnapshot.
 * This adds no AI or network call.
 */
export function evaluateGeneratedClaimVerificationIntegrity(input: Readonly<{
  document: ContentDocument;
  plan?: VerificationGenerationPlan;
  currentRevisionId?: string;
}>): GeneratedClaimVerificationIntegrityResult {
  if (!input.plan) return passedResult();

  const stored = input.document.metadata?.generatedClaimVerification;
  if (!stored) {
    return failedResult([
      "검증 Claim Snapshot이 현재 canonical 원고에 저장되어 있지 않습니다.",
    ]);
  }

  const gate = evaluateVerificationGenerationGate({
    plan: input.plan,
    snapshot: stored.verificationSnapshot,
  });
  if (!gate.ready) {
    const detail = [
      ...gate.diagnostics,
      ...gate.blockingClaimIds.map((claimId) => `claim:${claimId}`),
    ].join(", ");
    return failedResult([
      `저장된 검증 Snapshot이 현재 Generation Gate를 통과하지 못합니다${detail ? `: ${detail}` : ""}.`,
    ]);
  }

  const rebound = bindGeneratedClaims({
    document: input.document,
    plan: input.plan,
    snapshot: stored.verificationSnapshot,
    gate,
  });
  const reasons: string[] = [];
  for (const binding of rebound.bindings) {
    if (binding.reference.referenceType !== "unverifiedDetected") continue;
    reasons.push(
      `검증되지 않은 고위험 사실이 원고에 남아 있습니다: ${binding.matchedText} (${bindingLocation(binding.location)}).`,
    );
  }

  if (stored.semanticContractVersion === 1) {
    if (!stored.semanticClaims) {
      reasons.push("구조화 Generated Claim semantic contract가 canonical metadata에서 누락되었습니다.");
    } else {
      const semantic = evaluateStoredGeneratedFactualClaims({
        document: input.document,
        plan: input.plan,
        snapshot: stored.verificationSnapshot,
        gate,
        claims: stored.semanticClaims,
      });
      reasons.push(...semantic.reasons);
    }
  }

  if (
    input.currentRevisionId
    && stored.boundEditorialRevisionId === input.currentRevisionId
  ) {
    const expected = JSON.stringify({
      bindings: rebound.bindings,
      verifiedClaimIds: rebound.verifiedClaimIds,
      unverifiedDetectedCount: rebound.unverifiedDetectedCount,
    });
    const actual = JSON.stringify({
      bindings: stored.bindings,
      verifiedClaimIds: stored.verifiedClaimIds,
      unverifiedDetectedCount: stored.unverifiedDetectedCount,
    });
    if (expected !== actual) {
      reasons.push(
        "현재 원고 revision의 저장된 Claim binding이 서버 재계산 결과와 일치하지 않습니다.",
      );
    }
  }

  return Object.freeze({
    passed: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)]),
    bindings: rebound.bindings,
    verifiedClaimIds: rebound.verifiedClaimIds,
    unverifiedDetectedCount: rebound.unverifiedDetectedCount,
  });
}

export function assertGeneratedClaimVerificationIntegrity(input: Readonly<{
  document: ContentDocument;
  plan?: VerificationGenerationPlan;
  currentRevisionId?: string;
}>): void {
  const result = evaluateGeneratedClaimVerificationIntegrity(input);
  if (result.passed) return;
  throw new Error(
    `Publishing blocked: generated Claim verification failed. ${result.reasons.join(" ")}`,
  );
}

function passedResult(): GeneratedClaimVerificationIntegrityResult {
  return Object.freeze({
    passed: true,
    reasons: Object.freeze([]),
    bindings: Object.freeze([]),
    verifiedClaimIds: Object.freeze([]),
    unverifiedDetectedCount: 0,
  });
}

function failedResult(
  reasons: readonly string[],
): GeneratedClaimVerificationIntegrityResult {
  return Object.freeze({
    passed: false,
    reasons: Object.freeze([...new Set(reasons)]),
    bindings: Object.freeze([]),
    verifiedClaimIds: Object.freeze([]),
    unverifiedDetectedCount: 0,
  });
}

function bindingLocation(location: GeneratedClaimLocation): string {
  if (location.kind === "title") return "title";
  if (location.kind === "metadata") return `metadata.${location.field}`;
  return `block:${location.blockId}`;
}
