import { canonicalizeApprovalEvidenceUrl } from "../approval";
import {
  groupVerificationGenerationClaimEvidence,
  type VerificationGenerationClaimEvidence,
} from "../approval/VerificationGenerationEvidence";
import type { VerificationSnapshot } from "../approval/VerificationClaim";
import type {
  VerificationGenerationGateResult,
  VerificationGenerationPlan,
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
  /**
   * 생성 직전 검증 Gate를 걷는다 (D-045).
   *
   * 이 Gate는 CRITICAL Claim 이 스냅샷에서 `verified` 여야 생성을 시작했다. 그
   * `verified` 를 만들던 것이 Preflight 의 의미 검증과 커버리지인데, 그 둘을
   * 걷어낸 이상 이 Gate 는 판정하는 척만 남는다. 2026-08-19 실측: "전월세 신고
   * 대상 확인 방법" 이 Preflight 의 semantic_verification_failed 로 막혔고, 그
   * 앞을 풀어도 이 Gate 가 같은 자리에서 다시 막았을 것이다.
   *
   * 번들은 이제 판정이 아니라 귀속이다. 인정 범위 안에서 실제로 열린 출처와
   * 그 출처가 어떤 Claim 에 붙는지를 생성에 그대로 넘긴다. 본문 맨 끝 출처
   * 목록도 이 연결에서 나온다.
   */
  const allowedUrls = new Set(input.sources.map((source) =>
    canonicalizeApprovalEvidenceUrl(source.url)));
  const planById = new Map(input.plan.claims.map((claim) => [
    claim.claimId,
    claim,
  ]));

  const sources = Object.freeze(input.sources.filter((source) =>
    allowedUrls.has(canonicalizeApprovalEvidenceUrl(source.url))));
  const sourceUrls = new Set(sources.map((source) =>
    canonicalizeApprovalEvidenceUrl(source.url)));

  const claimSources = Object.freeze(input.claimSources.flatMap((source) => {
    const url = canonicalizeApprovalEvidenceUrl(source.url);
    if (!allowedUrls.has(url) || !sourceUrls.has(url)) return [];
    const verificationClaims = Object.freeze((source.verificationClaims ?? [])
      .filter((projection) => attributedProjection(projection, url, planById)));
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
  /**
   * 연결이 비어 있어도 생성을 막지 않는다. 출처를 붙이지 못한 Claim 은 본문에
   * 그 값을 쓰지 못할 뿐이고, 그 판단은 생성 지시가 한다.
   */
  const gate = Object.freeze({
    ready: true,
    blockingClaimIds: Object.freeze([] as string[]),
    verifiedClaimIds: Object.freeze(verificationClaims.map((claim) => claim.claimId)),
    verifiedSourceIds: Object.freeze(claimSources.map((source) => source.url)),
    verifiedCanonicalUrls: Object.freeze(sources.map((source) =>
      canonicalizeApprovalEvidenceUrl(source.url))),
    diagnostics: Object.freeze([] as string[]),
  });

  return Object.freeze({
    gate,
    sources,
    claimSources,
    verificationClaims,
    ...(input.coverage ? { coverage: input.coverage } : {}),
    ...(input.sourcePolicyCompliance ? { sourcePolicyCompliance: input.sourcePolicyCompliance } : {}),
  });
}

/**
 * 이 투영이 이 출처에 붙는 것이 맞는가만 본다. 값이 페이지에 있는지는 묻지
 * 않는다 (D-045).
 */
function attributedProjection(
  projection: Readonly<{ claimId: string; source: Readonly<{ canonicalUrl: string }> }>,
  parentUrl: string,
  planById: ReadonlyMap<string, VerificationGenerationPlan["claims"][number]>,
): boolean {
  return canonicalizeApprovalEvidenceUrl(projection.source.canonicalUrl) === parentUrl
    && planById.has(projection.claimId);
}

