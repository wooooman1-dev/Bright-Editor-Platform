import type { VerificationClaimKind, VerificationClaimResult, VerificationClaimSpec } from "./VerificationClaim";
import { countAuthoritativeInstitutions, countIndependentInstitutions, hasPrimaryOfficial } from "./VerificationSourceIdentity";

export const highRiskVerificationKinds: readonly VerificationClaimKind[] = ["money", "ratio", "date", "dateRange", "location", "eligibility", "legal"];
export const configurableHighRiskVerificationKinds: readonly VerificationClaimKind[] = ["duration"];

/**
 * Evidence approval policy:
 * - Numeric/date/duration values are not independently compared with the
 *   Planning Claim at the approval gate.
 * - One authoritative primary official source is sufficient.
 * - Without an official source, a high-risk Claim requires at least one
 *   independent non-authoritative corroborating institution in addition to
 *   the first non-authoritative source.
 *
 * Discovery/search is responsible for supplying the corroborating source
 * before Generation. This policy itself performs no network I/O.
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

  const officialCoveragePassed = authoritativeInstitutionCount >= 1 && primarySourceFound;
  const corroboratedNonOfficialCoveragePassed = countFreshNonAuthoritativeInstitutions(sources) >= 2;
  const thresholdPassed = !highRisk || officialCoveragePassed || corroboratedNonOfficialCoveragePassed;
  const freshnessPassed = usableFresh.length > 0 && thresholdPassed;

  const status = result.unresolvedConflict
    ? "conflicted"
    : result.normalizedValue && freshnessPassed
      ? "verified"
      : usableFresh.length === 0 && staleSupporting
        ? "stale"
        : highRisk || unknownSupporting || usableFresh.length > 0
          ? "insufficient"
          : "planned";

  return Object.freeze({ ...result, status, freshnessPassed, independentInstitutionCount, authoritativeInstitutionCount, primarySourceFound });
}

function countFreshNonAuthoritativeInstitutions(sources: readonly VerificationClaimResult["sourceAssessments"][number][]): number {
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

export function isHighRiskVerificationKind(kind: VerificationClaimKind): boolean { return highRiskVerificationKinds.includes(kind); }
