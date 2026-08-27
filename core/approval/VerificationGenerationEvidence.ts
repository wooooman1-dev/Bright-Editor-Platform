import { canonicalizeApprovalEvidenceUrl } from "./ApprovalEvidenceSelection";
import type { ExplicitDiscoveredSource } from "./ExplicitVerificationPreflight";
import type {
  VerificationClaimKind,
  VerificationClaimQualifiers,
  VerificationClaimSpec,
  VerificationNormalizedValue,
  VerificationSnapshot,
  VerificationSourceRole,
  VerificationTemporalEvidence,
  VerificationTemporalRequirement,
} from "./VerificationClaim";

export type VerificationGenerationEvidenceSource = Readonly<{
  sourceId: string;
  canonicalUrl: string;
  role: VerificationSourceRole;
  authoritative: boolean;
  evidenceExcerpt: string;
  temporalEvidence?: VerificationTemporalEvidence;
}>;

export type VerificationGenerationClaimSourceProjection = Readonly<{
  claimId: string;
  field: string;
  kind: VerificationClaimKind;
  statement: string;
  required: boolean;
  normalizedValue: VerificationNormalizedValue;
  qualifiers: VerificationClaimQualifiers;
  temporalRequirement?: VerificationTemporalRequirement;
  source: VerificationGenerationEvidenceSource;
}>;

export type VerificationGenerationClaimSource = Readonly<{
  url: string;
  claims: readonly VerificationGenerationClaimSourceProjection[];
}>;

export type VerificationGenerationClaimEvidence = Readonly<{
  claimId: string;
  field: string;
  kind: VerificationClaimKind;
  statement: string;
  required: boolean;
  normalizedValue: VerificationNormalizedValue;
  qualifiers: VerificationClaimQualifiers;
  temporalRequirement?: VerificationTemporalRequirement;
  sources: readonly VerificationGenerationEvidenceSource[];
}>;

/**
 * Builds the Claim-ID-owned explicit Generation evidence projection from the
 * already validated Source Preflight records and canonical VerificationSnapshot.
 * Legacy field/value compatibility data is intentionally not authoritative here.
 *
 * 판정은 생성에 넘길 값을 거르지 않는다. 페이지를 실제로 열어 뽑아낸 값이면
 * Claim 판정 상태와 무관하게 전부 넘긴다 -- 판정이 값을 가로막던 것이
 * 사장님이 없애라고 하신 내용 대조의 마지막 형태였다. 2026-08-26 실측:
 * 선택약정 요금 할인율은 status insufficient 로 값이 생성에 도달하지 못했고,
 * 통신비 조회 대상 사업자는 통신사 4곳 이름이 normalizedValue 에 들어 있는데도
 * 본문은 "운영기관이 정한 대상에 한정됩니다" 로 나갔다.
 *
 * 남기는 조건은 내용 판단이 아닌 것들뿐이다: 인용한 발췌가 그 페이지의
 * 텍스트에 실제로 있었을 것(evidence_anchor_unverified 가 아닐 것), 그 페이지에서
 * 값이 실제로 뽑혔을 것, 낡았다고 판정된 값(freshnessStatus stale)이 아닐 것,
 * 그리고 Claim 의 시간 의미가 unknown 이 아닐 것. 앞의 둘은 지어내기를 막고
 * 뒤의 둘은 언제 유효한지 모르는 값이 본문에 숫자로 박히는 것을 막는다.
 * freshnessStatus 가 unknown 인 것은 통과시킨다 - 낡았다는 판정이 아니라
 * 시점을 확인하지 못했다는 뜻이고, 그것 때문에 값을 버리던 것이
 * 선택약정 요금 할인율이 사라진 경로였다.
 *
 * 무엇이 verified 였는지는 VerificationSnapshot 에 진단으로 그대로 남는다.
 */
export function createVerificationGenerationClaimSources(input: Readonly<{
  claims: readonly VerificationClaimSpec[];
  snapshot: VerificationSnapshot;
  sources: readonly ExplicitDiscoveredSource[];
}>): readonly VerificationGenerationClaimSource[] {
  const specs = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const results = new Map(input.snapshot.results.map((result) => [result.claimId, result]));
  const byUrl = new Map<string, VerificationGenerationClaimSourceProjection[]>();

  for (const discoveredSource of input.sources) {
    const sourceUrl = canonicalizeApprovalEvidenceUrl(
      discoveredSource.finalUrl ?? discoveredSource.requestedUrl,
    );
    if (!sourceUrl) continue;

    for (const discoveredClaim of discoveredSource.claims) {
      const spec = specs.get(discoveredClaim.claimId);
      const result = results.get(discoveredClaim.claimId);
      // 시간 의미를 분류하지 못한 Claim 은 값이 언제 유효한지 알 수 없어 넘기지 않는다.
      if (!spec || !result || spec.temporalRequirement?.mode === "unknown") continue;

      const assessment = result.sourceAssessments.find((candidate) => {
        const candidateUrl = candidate.canonicalUrl
          ? canonicalizeApprovalEvidenceUrl(candidate.canonicalUrl)
          : "";
        return candidateUrl === sourceUrl
          && !candidate.diagnostics?.includes("evidence_anchor_unverified")
          && candidate.freshnessStatus !== "stale";
      });
      const normalizedValue = result.normalizedValue ?? assessment?.normalizedValue;
      if (!assessment || !normalizedValue || !discoveredClaim.evidenceExcerpt.trim()) continue;

      const source = Object.freeze({
        sourceId: assessment.sourceId,
        canonicalUrl: sourceUrl,
        role: assessment.role,
        authoritative: assessment.authoritative,
        evidenceExcerpt: discoveredClaim.evidenceExcerpt.trim(),
        ...(assessment.temporalEvidence
          ? { temporalEvidence: assessment.temporalEvidence }
          : {}),
      });
      const projection = Object.freeze({
        claimId: spec.claimId,
        field: spec.field,
        kind: spec.kind,
        statement: spec.statement,
        required: spec.required,
        normalizedValue,
        qualifiers: Object.freeze({ ...spec.qualifiers }),
        ...(spec.temporalRequirement
          ? { temporalRequirement: spec.temporalRequirement }
          : {}),
        source,
      });
      const current = byUrl.get(sourceUrl) ?? [];
      current.push(projection);
      byUrl.set(sourceUrl, current);
    }
  }

  return Object.freeze([...byUrl.entries()].map(([url, claims]) => Object.freeze({
    url,
    claims: Object.freeze([...claims]),
  })));
}

/**
 * Groups source-owned projections back into one canonical contract per Claim ID.
 * Any conflicting duplicated contract is rejected instead of being merged.
 */
export function groupVerificationGenerationClaimEvidence(
  projections: readonly VerificationGenerationClaimSourceProjection[],
): readonly VerificationGenerationClaimEvidence[] {
  const grouped = new Map<string, {
    contract: Omit<VerificationGenerationClaimEvidence, "sources">;
    fingerprint: string;
    sources: VerificationGenerationEvidenceSource[];
  }>();

  for (const projection of projections) {
    const contract = Object.freeze({
      claimId: projection.claimId,
      field: projection.field,
      kind: projection.kind,
      statement: projection.statement,
      required: projection.required,
      normalizedValue: projection.normalizedValue,
      qualifiers: projection.qualifiers,
      ...(projection.temporalRequirement
        ? { temporalRequirement: projection.temporalRequirement }
        : {}),
    });
    const fingerprint = canonicalJson(contract);
    const existing = grouped.get(projection.claimId);
    if (existing && existing.fingerprint !== fingerprint) {
      throw new Error(
        `verification_generation_claim_projection_mismatch:${projection.claimId}`,
      );
    }
    if (existing) {
      if (!existing.sources.some((source) => source.sourceId === projection.source.sourceId
        && canonicalizeApprovalEvidenceUrl(source.canonicalUrl)
          === canonicalizeApprovalEvidenceUrl(projection.source.canonicalUrl))) {
        existing.sources.push(projection.source);
      }
      continue;
    }
    grouped.set(projection.claimId, {
      contract,
      fingerprint,
      sources: [projection.source],
    });
  }

  return Object.freeze([...grouped.values()].map((value) => Object.freeze({
    ...value.contract,
    sources: Object.freeze([...value.sources]),
  })));
}

export function verificationGenerationClaimContractMatches(
  projection: VerificationGenerationClaimSourceProjection,
  spec: VerificationClaimSpec,
  normalizedValue: VerificationNormalizedValue,
): boolean {
  return projection.claimId === spec.claimId
    && projection.field === spec.field
    && projection.kind === spec.kind
    && projection.statement === spec.statement
    && projection.required === spec.required
    && canonicalJson(projection.normalizedValue) === canonicalJson(normalizedValue)
    && canonicalJson(projection.qualifiers) === canonicalJson(spec.qualifiers)
    && canonicalJson(projection.temporalRequirement)
      === canonicalJson(spec.temporalRequirement);
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
