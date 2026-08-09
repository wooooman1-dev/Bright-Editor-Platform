import { canonicalizeApprovalEvidenceUrl } from "../approval";
import {
  groupVerificationGenerationClaimEvidence,
  verificationGenerationClaimContractMatches,
  type VerificationGenerationClaimEvidence,
  type VerificationGenerationClaimSourceProjection,
} from "../approval/VerificationGenerationEvidence";
import type { VerificationSnapshot } from "../approval/VerificationClaim";
import {
  evaluateVerificationGenerationGate,
  type VerificationGenerationGateResult,
  type VerificationGenerationPlan,
} from "../approval/VerificationGenerationGate";
import type { AIWebSource } from "./AIProvider";
import {
  ApprovalSourcePreflightError,
  type ApprovalSourcePreflightResult,
  type ApprovalSourcePreflightClaimSource,
} from "./ApprovalSourcePreflight";
import type { ApprovalRequiredEvidenceContract } from "../approval/ApprovalSourcePreflightCoverage";
import type { ApprovalSourcePreflightCoverageResult } from "../approval/ApprovalSourcePreflightCoverage";

export type VerificationGenerationBundle = Readonly<{
  gate: VerificationGenerationGateResult;
  sources: readonly AIWebSource[];
  claimSources: readonly ApprovalSourcePreflightClaimSource[];
  verificationClaims: readonly VerificationGenerationClaimEvidence[];
  coverage?: ApprovalSourcePreflightCoverageResult;
  sourcePolicyCompliance?: "passed" | "failed" | "not_required";
}>;

export function requireApprovalGenerationEvidence(input: Readonly<{
  preflight: ApprovalSourcePreflightResult;
  contract?: ApprovalRequiredEvidenceContract;
}>): ApprovalSourcePreflightResult {
  const contract = input.contract;
  if (!contract?.profileSourceRequirementApplicable) return input.preflight;
  const hasRequiredClaims = !contract.explicitVerificationRequired
    && contract.requiredClaims.length > 0;
  if (input.preflight.sourcePolicyCompliance !== "passed"
    || input.preflight.sources.length === 0
    || (hasRequiredClaims && input.preflight.coverage.status !== "covered")) {
    throw new ApprovalSourcePreflightError(
      "?꾩옱 ?꾨줈?꾩씠???꾩슂??Evidence coverage ?먮뒗 source policy瑜?Generation ?꾩뿉 ?뺤씤?섏? 紐삵뻽?듬땲??",
    );
  }
  return input.preflight;
}

/**
 * Converts the diagnostic-rich explicit preflight result into the only evidence
 * bundle that Generation is allowed to see.
 */
export function requireExplicitVerificationGenerationBundle(input: Readonly<{
  plan: VerificationGenerationPlan;
  snapshot?: VerificationSnapshot;
  sources: readonly AIWebSource[];
  claimSources: readonly ApprovalSourcePreflightClaimSource[];
  coverage?: ApprovalSourcePreflightCoverageResult;
  sourcePolicyCompliance?: "passed" | "failed" | "not_required";
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

  const snapshot = input.snapshot!;
  const allowedUrls = new Set(
    gate.verifiedCanonicalUrls.map(canonicalizeApprovalEvidenceUrl),
  );
  const allowedSourceIds = new Set(gate.verifiedSourceIds);
  const verifiedClaimIds = new Set(gate.verifiedClaimIds);
  const planById = new Map(input.plan.claims.map((claim) => [
    claim.claimId,
    claim,
  ]));
  const resultById = new Map(snapshot.results.map((result) => [
    result.claimId,
    result,
  ]));

  const sources = Object.freeze(input.sources.filter((source) =>
    allowedUrls.has(canonicalizeApprovalEvidenceUrl(source.url))));
  const sourceUrls = new Set(sources.map((source) =>
    canonicalizeApprovalEvidenceUrl(source.url)));

  const claimSources = Object.freeze(input.claimSources.flatMap((source) => {
    const url = canonicalizeApprovalEvidenceUrl(source.url);
    if (!allowedUrls.has(url) || !sourceUrls.has(url)) return [];
    const verificationClaims = Object.freeze((source.verificationClaims ?? [])
      .filter((projection) => trustedProjection({
        projection,
        parentUrl: url,
        allowedSourceIds,
        verifiedClaimIds,
        planById,
        resultById,
      })));
    return [Object.freeze({
      url: source.url,
      claims: source.claims,
      ...(verificationClaims.length ? { verificationClaims } : {}),
    })];
  }));

  const projections = Object.freeze(claimSources.flatMap((source) =>
    source.verificationClaims ?? []));
  const verificationClaims = groupVerificationGenerationClaimEvidence(
    projections,
  );
  const projectedClaimIds = new Set(
    verificationClaims.map((claim) => claim.claimId),
  );
  const missingClaimIds = gate.verifiedClaimIds.filter((claimId) =>
    !projectedClaimIds.has(claimId));

  if (missingClaimIds.length) {
    throw new ApprovalSourcePreflightError(
      `검증된 Claim과 Claim-ID Generation 근거의 연결이 일치하지 않아 원고 생성을 시작하지 않았습니다. 미연결 Claim: ${missingClaimIds.join(", ")}.`,
    );
  }

  if (gate.verifiedClaimIds.length > 0
    && (!sources.length || !claimSources.length || !verificationClaims.length)) {
    throw new ApprovalSourcePreflightError(
      "검증된 Claim과 Generation 근거 bundle의 연결이 일치하지 않아 원고 생성을 시작하지 않았습니다.",
    );
  }

  return Object.freeze({
    gate,
    sources,
    claimSources,
    verificationClaims,
    ...(input.coverage ? { coverage: input.coverage } : {}),
    ...(input.sourcePolicyCompliance ? { sourcePolicyCompliance: input.sourcePolicyCompliance } : {}),
  });
}

function trustedProjection(input: Readonly<{
  projection: VerificationGenerationClaimSourceProjection;
  parentUrl: string;
  allowedSourceIds: ReadonlySet<string>;
  verifiedClaimIds: ReadonlySet<string>;
  planById: ReadonlyMap<string, VerificationGenerationPlan["claims"][number]>;
  resultById: ReadonlyMap<string, VerificationSnapshot["results"][number]>;
}>): boolean {
  const projection = input.projection;
  const projectionUrl = canonicalizeApprovalEvidenceUrl(
    projection.source.canonicalUrl,
  );
  if (!projection.source.evidenceExcerpt.trim()
    || projectionUrl !== input.parentUrl
    || !input.allowedSourceIds.has(projection.source.sourceId)
    || !input.verifiedClaimIds.has(projection.claimId)) {
    return false;
  }

  const spec = input.planById.get(projection.claimId);
  const result = input.resultById.get(projection.claimId);
  if (!spec
    || !result
    || result.status !== "verified"
    || !result.normalizedValue
    || !verificationGenerationClaimContractMatches(
      projection,
      spec,
      result.normalizedValue,
    )) {
    return false;
  }

  const assessment = result.sourceAssessments.find((candidate) =>
    candidate.sourceId === projection.source.sourceId
    && Boolean(candidate.canonicalUrl)
    && canonicalizeApprovalEvidenceUrl(candidate.canonicalUrl!) === projectionUrl
    && candidate.supports === true
    && candidate.fresh === true
    && candidate.freshnessStatus === "fresh"
    && Boolean(candidate.normalizedValue));
  if (!assessment || !assessment.normalizedValue) return false;

  return assessment.role === projection.source.role
    && assessment.authoritative === projection.source.authoritative
    && canonicalJson(assessment.normalizedValue)
      === canonicalJson(result.normalizedValue)
    && canonicalJson(assessment.temporalEvidence)
      === canonicalJson(projection.source.temporalEvidence);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}
