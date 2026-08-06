import type { VerificationClaimKind, VerificationClaimResult, VerificationClaimSpec } from "./VerificationClaim";
import { countAuthoritativeInstitutions, countIndependentInstitutions, hasPrimaryOfficial } from "./VerificationSourceIdentity";
export const highRiskVerificationKinds: readonly VerificationClaimKind[] = ["money", "ratio", "date", "dateRange", "location", "eligibility", "legal"];
export const configurableHighRiskVerificationKinds: readonly VerificationClaimKind[] = ["duration"];
export function evaluateVerificationClaim(spec: VerificationClaimSpec, result: Omit<VerificationClaimResult, "status" | "independentInstitutionCount" | "authoritativeInstitutionCount" | "primarySourceFound">): VerificationClaimResult {
  const sources = result.sourceAssessments; const independentInstitutionCount = countIndependentInstitutions(sources); const authoritativeInstitutionCount = countAuthoritativeInstitutions(sources); const primarySourceFound = hasPrimaryOfficial(sources); const highRisk = highRiskVerificationKinds.includes(spec.kind);
  const status = result.unresolvedConflict ? "conflicted" : !result.freshnessPassed ? "stale" : highRisk && (independentInstitutionCount < 3 || authoritativeInstitutionCount < 2 || !primarySourceFound) ? "insufficient" : result.normalizedValue ? "verified" : "planned";
  return Object.freeze({ ...result, status, independentInstitutionCount, authoritativeInstitutionCount, primarySourceFound });
}
export function isHighRiskVerificationKind(kind: VerificationClaimKind): boolean { return highRiskVerificationKinds.includes(kind); }
