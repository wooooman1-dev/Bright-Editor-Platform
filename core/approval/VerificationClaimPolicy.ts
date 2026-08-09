import type { VerificationClaimKind, VerificationClaimResult, VerificationClaimSpec } from "./VerificationClaim";
import { countAuthoritativeInstitutions, countIndependentInstitutions, hasPrimaryOfficial } from "./VerificationSourceIdentity";
export const highRiskVerificationKinds: readonly VerificationClaimKind[] = ["money", "ratio", "date", "dateRange", "location", "eligibility", "legal"];
export const configurableHighRiskVerificationKinds: readonly VerificationClaimKind[] = ["duration"];
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
  // CRITICAL is an authority and complete-Coverage policy, not a popularity
  // vote. One fresh authoritative primary source can own a Claim; additional
  // sources are useful for conflict detection but are never a universal quota.
  const thresholdPassed = !highRisk || (authoritativeInstitutionCount >= 1 && primarySourceFound);
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
export function isHighRiskVerificationKind(kind: VerificationClaimKind): boolean { return highRiskVerificationKinds.includes(kind); }
