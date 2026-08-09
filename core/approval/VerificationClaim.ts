export type VerificationMode = "legacy" | "explicit";
/** NONE is editorial-only; VERIFY is best-effort; CRITICAL requires Evidence. */
export type VerificationClaimRisk = "none" | "verify" | "critical";
export type VerificationClaimKind = "money" | "ratio" | "date" | "dateRange" | "duration" | "location" | "eligibility" | "legal" | "general";
export type VerificationClaimStatus = "planned" | "verified" | "insufficient" | "conflicted" | "stale";
export type VerificationOverallStatus = "not_required" | "planned" | "verified" | "insufficient" | "conflicted" | "stale";
export type VerificationSourceRole = "primaryOfficial" | "officialCorroborating" | "independentCorroborating";
export type NormalizedMoney = Readonly<{ amount: number; currency: string; comparator?: "eq" | "lt" | "lte" | "gt" | "gte" | "range"; basis: "oneTime" | "daily" | "monthly" | "annual" | "total" | "perPerson" | "perHousehold"; taxIncluded?: boolean }>;
export type NormalizedRatio = Readonly<{ value: number; representation: "percent" | "fraction" | "percentagePoint"; comparator?: "eq" | "lt" | "lte" | "gt" | "gte" | "range"; meaning: "rate" | "share" | "change" }>;
export type NormalizedDate = Readonly<{ value: string; precision: "day" | "month" | "year"; role: "announced" | "effective" | "applicationStart" | "applicationEnd" | "reference" }>;
export type NormalizedDateRange = Readonly<{ start: string; end: string; inclusive: boolean; timezone?: string; locale?: string }>;
export type NormalizedDuration = Readonly<{ value: number; unit: "day" | "week" | "month" | "year"; comparator?: "eq" | "upTo" | "atLeast" | "range" }>;
export type NormalizedLocation = Readonly<{ country?: string; region?: string; city?: string; address?: string; venue?: string; hall?: string; scope: "national" | "regional" | "local" | "specific" }>;
export type EligibilityPredicate = Readonly<{ field: string; operator: string; value: string | number | boolean | readonly (string | number)[] } | { all: readonly EligibilityPredicate[] } | { any: readonly EligibilityPredicate[] }>;
export type NormalizedEligibility = Readonly<{ predicate: EligibilityPredicate }>;
export type NormalizedLegalClaim = Readonly<{ lawName: string; article?: string; paragraph?: string; effectiveDate?: string; proposition: string; sourceClass: "statute" | "regulation" | "officialGuidance" | "caseLaw" | "interpretation" }>;
export type NormalizedGeneralClaim = Readonly<{ statement: string }>;
export type VerificationNormalizedValue =
  | Readonly<{ kind: "money"; value: NormalizedMoney }> | Readonly<{ kind: "ratio"; value: NormalizedRatio }>
  | Readonly<{ kind: "date"; value: NormalizedDate }> | Readonly<{ kind: "dateRange"; value: NormalizedDateRange }>
  | Readonly<{ kind: "duration"; value: NormalizedDuration }> | Readonly<{ kind: "location"; value: NormalizedLocation }>
  | Readonly<{ kind: "eligibility"; value: NormalizedEligibility }> | Readonly<{ kind: "legal"; value: NormalizedLegalClaim }>
  | Readonly<{ kind: "general"; value: NormalizedGeneralClaim }>;
export type VerificationClaimQualifiers = Readonly<{ subject?: string; scope?: string; basis?: string; note?: string }>;
export type VerificationTemporalRequirement =
  | Readonly<{ mode: "current" }>
  | Readonly<{ mode: "asOf"; date: string }>
  | Readonly<{ mode: "period"; start: string; end: string }>
  | Readonly<{ mode: "notRequired" }>
  | Readonly<{ mode: "unknown" }>;
export type VerificationTemporalEvidenceKind = "effectivePeriod" | "validThrough" | "referenceDate" | "referencePeriod";
export type VerificationTemporalEvidence = Readonly<{
  kind: VerificationTemporalEvidenceKind;
  evidenceExcerpt: string;
  date?: string;
  start?: string;
  end?: string;
}>;
export type VerificationClaimSpec = Readonly<{ claimId: string; atomicity?: "single_assertion"; field: string; kind: VerificationClaimKind; statement: string; rawValue?: string; qualifiers: VerificationClaimQualifiers; temporalRequirement?: VerificationTemporalRequirement; required: boolean; risk?: VerificationClaimRisk; policyId?: string }>;
export type VerificationFreshnessStatus = "fresh" | "stale" | "unknown";
export type VerificationSourceAssessment = Readonly<{ sourceId: string; institutionGroupId: string; sourceFamilyId?: string; canonicalUrl?: string; publisherId?: string; role: VerificationSourceRole; authoritative: boolean; supports: boolean; normalizedValue?: VerificationNormalizedValue; freshnessStatus?: VerificationFreshnessStatus; observedAt?: string; effectiveFrom?: string; effectiveUntil?: string; temporalEvidence?: VerificationTemporalEvidence; fresh: boolean; diagnostics: readonly string[] }>;
export type VerificationClaimResult = Readonly<{ claimId: string; status: VerificationClaimStatus; normalizedValue?: VerificationNormalizedValue; sourceAssessments: readonly VerificationSourceAssessment[]; independentInstitutionCount: number; authoritativeInstitutionCount: number; primarySourceFound: boolean; unresolvedConflict: boolean; freshnessPassed: boolean; verifiedAt?: string; reviewBy?: string; diagnostics: readonly string[] }>;
export type VerificationSnapshot = Readonly<{ verificationMode: VerificationMode; claimDefinitionFingerprint: string; sourceSnapshotFingerprint: string; results: readonly VerificationClaimResult[]; overallStatus: VerificationOverallStatus; createdAt: string; updatedAt: string; verificationSnapshotFingerprint: string }>;
export type GeneratedClaimReference = Readonly<{ referenceType: "verified"; verificationClaimId: string; sourceIds: readonly string[] }> | Readonly<{ referenceType: "unverifiedDetected"; diagnosticCode: string }>;
export function verificationOverallStatus(claims: readonly VerificationClaimSpec[], results: readonly VerificationClaimResult[] = []): VerificationOverallStatus {
  if (!claims.some(isCriticalVerificationClaim)) return "not_required";
  if (!results.length) return "planned";
  const requiredIds = new Set(claims.filter(isCriticalVerificationClaim).map((claim) => claim.claimId));
  const relevant = requiredIds.size ? results.filter((result) => requiredIds.has(result.claimId)) : results;
  if (!relevant.length) return "verified";
  const statuses = relevant.map((result) => result.status);
  if (statuses.includes("conflicted")) return "conflicted";
  if (statuses.includes("stale")) return "stale";
  if (statuses.includes("insufficient")) return "insufficient";
  if (statuses.includes("planned")) return "planned";
  return "verified";
}

export function verificationClaimRisk(claim: Pick<VerificationClaimSpec, "required" | "risk" | "kind">): VerificationClaimRisk {
  if (claim.risk === "none" || claim.risk === "critical" || claim.risk === "verify") return claim.risk;
  return claim.required ? "critical" : "verify";
}

export function isCriticalVerificationClaim(claim: Pick<VerificationClaimSpec, "required" | "risk" | "kind">): boolean {
  return verificationClaimRisk(claim) === "critical";
}
