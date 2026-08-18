import type { VerificationClaimKind, VerificationClaimResult, VerificationClaimSpec, VerificationNormalizedValue, VerificationSourceAssessment } from "./VerificationClaim";
import { countAuthoritativeInstitutions, countIndependentInstitutions, hasPrimaryOfficial } from "./VerificationSourceIdentity";

export const highRiskVerificationKinds: readonly VerificationClaimKind[] = ["money", "ratio", "date", "dateRange", "location", "eligibility", "legal"];
export const configurableHighRiskVerificationKinds: readonly VerificationClaimKind[] = ["duration"];

/**
 * Evidence approval policy:
 * - A discovered source may support the Claim with a materially different
 *   value. A value difference is evidence to resolve, not an automatic
 *   failure.
 * - One authoritative primary official source is sufficient and owns the
 *   authoritative value when authoritative sources agree with it.
 * - Without a primary official source, one vote is counted per independent
 *   institution. A unique fresh majority may select the Claim value.
 * - A tie or disagreement among authoritative sources remains conflicted.
 * - Same-institution URLs never create additional consensus votes.
 *
 * Discovery/search is responsible for supplying corroborating sources before
 * Generation. This policy itself performs no network I/O.
 */
export function evaluateVerificationClaim(spec: VerificationClaimSpec, result: Omit<VerificationClaimResult, "status" | "independentInstitutionCount" | "authoritativeInstitutionCount" | "primarySourceFound">): VerificationClaimResult {
  const sources = result.sourceAssessments;
  const independentInstitutionCount = countIndependentInstitutions(sources);
  const authoritativeInstitutionCount = countAuthoritativeInstitutions(sources);
  const primarySourceFound = hasPrimaryOfficial(sources);
  const highRisk = highRiskVerificationKinds.includes(spec.kind);
  const usableFresh = sources.filter((source) => source.supports && source.normalizedValue && source.fresh && source.freshnessStatus !== "stale" && source.freshnessStatus !== "unknown");
  const staleSupporting = sources.some((source) => source.supports && source.normalizedValue && source.freshnessStatus === "stale");
  const unknownSupporting = sources.some((source) => source.supports && source.normalizedValue && source.freshnessStatus === "unknown")
    || result.diagnostics.some((diagnostic) => diagnostic === "freshness_unknown");
  const consensus = resolveFreshConsensus(usableFresh);
  const resolvedNormalizedValue = consensus.normalizedValue ?? result.normalizedValue;
  const unresolvedConflict = consensus.conflicted || (result.unresolvedConflict && !consensus.resolved);

  // A primary official source may resolve a changed value only after that
  // value has corroborating evidence. A lone primary source whose discovered
  // value conflicts with the server-owned Planning Claim remains insufficient
  // until corroboration resolves the discrepancy. Matching primary evidence
  // retains the one-authoritative-source fast path.
  const primaryOfficialValueMatchesPlan = sources.some((source) =>
    source.role === "primaryOfficial"
    && source.authoritative === true
    && source.supports
    && !source.diagnostics.includes("claim_raw_value_mismatch"),
  );
  const officialCoveragePassed = authoritativeInstitutionCount >= 1 && primarySourceFound && primaryOfficialValueMatchesPlan;
  const corroboratedNonOfficialCoveragePassed = countFreshNonAuthoritativeInstitutions(sources) >= 2;
  const thresholdPassed = !highRisk || officialCoveragePassed || corroboratedNonOfficialCoveragePassed;
  const freshnessPassed = usableFresh.length > 0 && thresholdPassed;

  const status = unresolvedConflict
    ? "conflicted"
    : resolvedNormalizedValue && freshnessPassed
      ? "verified"
      : usableFresh.length === 0 && staleSupporting
        ? "stale"
        : highRisk || unknownSupporting || usableFresh.length > 0
          ? "insufficient"
          : "planned";

  return Object.freeze({
    ...result,
    ...(resolvedNormalizedValue ? { normalizedValue: resolvedNormalizedValue } : {}),
    ...(consensus.diagnostic ? { diagnostics: Object.freeze([...result.diagnostics, consensus.diagnostic]) } : {}),
    status,
    freshnessPassed,
    independentInstitutionCount,
    authoritativeInstitutionCount,
    primarySourceFound,
  });
}

function countFreshNonAuthoritativeInstitutions(sources: readonly VerificationSourceAssessment[]): number {
  return new Set(
    sources
      .filter((source) => source.supports
        && source.normalizedValue
        && source.fresh
        && source.freshnessStatus !== "stale"
        && source.freshnessStatus !== "unknown"
        && source.authoritative !== true)
      .map((source) => source.institutionGroupId),
  ).size;
}

type ConsensusResult = Readonly<{
  normalizedValue?: VerificationNormalizedValue;
  conflicted: boolean;
  resolved: boolean;
  diagnostic?: string;
}>;

/** Resolves fresh values after collapsing multiple URLs from one institution into one vote. */
function resolveFreshConsensus(sources: readonly VerificationSourceAssessment[]): ConsensusResult {
  const institutionVotes = new Map<string, VerificationSourceAssessment>();
  for (const source of sources) {
    if (!source.normalizedValue) continue;
    const existing = institutionVotes.get(source.institutionGroupId);
    if (!existing || sourcePriority(source) > sourcePriority(existing)) institutionVotes.set(source.institutionGroupId, source);
  }
  const votes = [...institutionVotes.values()];
  if (!votes.length) return Object.freeze({ conflicted: false, resolved: false });

  const primary = votes.find((source) => source.role === "primaryOfficial" && source.authoritative === true);
  if (primary?.normalizedValue) {
    const primaryValue = primary.normalizedValue;
    const primaryKey = canonicalValue(primaryValue);
    const authoritativeConflict = votes.some((source) => {
      const value = source.normalizedValue;
      return source.authoritative === true && !!value && canonicalValue(value) !== primaryKey;
    });
    return Object.freeze({
      normalizedValue: primaryValue,
      conflicted: authoritativeConflict,
      resolved: true,
      ...(authoritativeConflict ? { diagnostic: "authoritative_value_conflict" } : {}),
    });
  }

  const counts = new Map<string, { value: VerificationNormalizedValue; count: number }>();
  for (const vote of votes) {
    const value = vote.normalizedValue;
    if (!value) continue;
    const key = canonicalValue(value);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  const ranked = [...counts.values()].sort((left, right) => right.count - left.count);
  const winner = ranked[0];
  if (!winner) return Object.freeze({ conflicted: false, resolved: false });
  const tied = ranked.length > 1 && ranked[1]!.count === winner.count;
  if (tied) return Object.freeze({ conflicted: true, resolved: false, diagnostic: "corroboration_value_tie" });
  const hadDisagreement = counts.size > 1;
  return Object.freeze({
    normalizedValue: winner.value,
    conflicted: false,
    resolved: true,
    ...(hadDisagreement ? { diagnostic: "corroboration_value_majority_selected" } : {}),
  });
}

function sourcePriority(source: VerificationSourceAssessment): number {
  if (source.role === "primaryOfficial" && source.authoritative === true) return 3;
  if (source.authoritative === true) return 2;
  return 1;
}

function canonicalValue(value: VerificationNormalizedValue): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}

export function isHighRiskVerificationKind(kind: VerificationClaimKind): boolean { return highRiskVerificationKinds.includes(kind); }
