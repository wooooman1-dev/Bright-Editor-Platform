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
      if (!spec || !result || result.status !== "verified" || !result.normalizedValue) {
        continue;
      }

      const assessment = result.sourceAssessments.find((candidate) => {
        const candidateUrl = candidate.canonicalUrl
          ? canonicalizeApprovalEvidenceUrl(candidate.canonicalUrl)
          : "";
        return candidateUrl === sourceUrl
          && candidate.supports === true
          && candidate.fresh === true
          && candidate.freshnessStatus === "fresh"
          && Boolean(candidate.normalizedValue);
      });
      if (!assessment || !discoveredClaim.evidenceExcerpt.trim()) continue;

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
        normalizedValue: result.normalizedValue,
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
