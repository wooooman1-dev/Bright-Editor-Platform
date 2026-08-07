import { describe, expect, it } from "vitest";
import { createContentOpportunityVerificationPlan } from "../../../../core/content";
import { createVerificationSnapshot, emptyVerificationSnapshot, type VerificationClaimSpec, type VerificationSourceAssessment } from "../../../../core/approval";

const claim: VerificationClaimSpec = { claimId: "claim-a", field: "amount", kind: "money", statement: "amount", qualifiers: {}, required: true };
const money = (amount: number) => ({ kind: "money" as const, value: { amount, currency: "KRW", basis: "total" as const } });
const source = (id: string, role: VerificationSourceAssessment["role"], authoritative: boolean, amount = 100): VerificationSourceAssessment => ({ sourceId: id, institutionGroupId: id, role, authoritative, supports: true, normalizedValue: money(amount), fresh: true, diagnostics: [] });

describe("explicit verification snapshot", () => {
  it("keeps an empty explicit plan distinct and makes no source assessments", () => {
    const plan = createContentOpportunityVerificationPlan([]);
    const snapshot = emptyVerificationSnapshot(plan, () => "2026-01-01T00:00:00.000Z");
    expect(snapshot.verificationMode).toBe("explicit");
    expect(snapshot.overallStatus).toBe("not_required");
    expect(snapshot.claimDefinitionFingerprint).toBe(plan.fingerprint);
    expect(snapshot.sourceSnapshotFingerprint).toBe(emptyVerificationSnapshot(plan, () => "2027-01-01T00:00:00.000Z").sourceSnapshotFingerprint);
  });

  it("counts institutions rather than URLs and verifies three independent sources", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const sameInstitutionPdf = { ...source("a-pdf", "officialCorroborating", true), institutionGroupId: "a" };
    const evidence = [source("a", "primaryOfficial", true), sameInstitutionPdf, source("b", "officialCorroborating", true), source("c", "independentCorroborating", false)];
    const snapshot = createVerificationSnapshot({ plan, assessments: evidence, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: evidence, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] }], now: () => "2026-01-01T00:00:00.000Z" });
    expect(snapshot.results[0]).toMatchObject({ status: "verified", independentInstitutionCount: 3, authoritativeInstitutionCount: 2, primarySourceFound: true });
  });

  it("does not count unsupported assessments and freezes nested data", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const assessments = [source("a", "primaryOfficial", true), { ...source("b", "officialCorroborating", true), supports: false }];
    const snapshot = createVerificationSnapshot({ plan, assessments, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: assessments, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] }] });
    expect(snapshot.results[0].independentInstitutionCount).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.results)).toBe(true);
    expect(Object.isFrozen(snapshot.results[0].sourceAssessments)).toBe(true);
  });

  it("verifies only at the trusted assessment boundary when all high-risk requirements are fresh", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const assessments = [source("a", "primaryOfficial", true), source("b", "officialCorroborating", true), source("c", "independentCorroborating", false)];
    const snapshot = createVerificationSnapshot({ plan, assessments, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: assessments, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] }] });
    expect(snapshot.results[0]).toMatchObject({ status: "verified", independentInstitutionCount: 3, authoritativeInstitutionCount: 2 });
  });

  it("keeps unknown primary, mixed freshness, and all-unknown evidence insufficient", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const fresh = source("fresh", "officialCorroborating", true);
    const unknown = { ...source("unknown", "primaryOfficial", true), fresh: false, freshnessStatus: "unknown" as const };
    const stale = { ...source("stale", "independentCorroborating", false), fresh: false, freshnessStatus: "stale" as const };
    const mixed = createVerificationSnapshot({ plan, assessments: [fresh, unknown, stale], results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: [fresh, unknown, stale], unresolvedConflict: false, freshnessPassed: true, diagnostics: ["freshness_unknown"] }] });
    expect(mixed.results[0]).toMatchObject({ status: "stale", independentInstitutionCount: 1, primarySourceFound: false });
    const unknowns = ["a", "b", "c"].map((id, index) => ({ ...source(id, index === 0 ? "primaryOfficial" : "officialCorroborating", true), fresh: false, freshnessStatus: "unknown" as const }));
    const allUnknown = createVerificationSnapshot({ plan, assessments: unknowns, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: unknowns, unresolvedConflict: false, freshnessPassed: false, diagnostics: ["freshness_unknown"] }] });
    expect(allUnknown.results[0]).toMatchObject({ status: "insufficient", independentInstitutionCount: 0, authoritativeInstitutionCount: 0 });
  });
});
