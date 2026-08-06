import { describe, expect, it } from "vitest";
import { verificationOverallStatus, type VerificationClaimSpec, type VerificationClaimResult } from "../../../../core/approval";
const spec: VerificationClaimSpec = { claimId: "c1", field: "amount", kind: "money", statement: "지원금", qualifiers: {}, required: true };
const result = (status: VerificationClaimResult["status"]): VerificationClaimResult => ({ claimId: "c1", status, sourceAssessments: [], independentInstitutionCount: 0, authoritativeInstitutionCount: 0, primarySourceFound: false, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] });
describe("Verification Claim contracts", () => {
  it("uses not_required for an empty plan", () => expect(verificationOverallStatus([])).toBe("not_required"));
  it("starts a non-empty plan as planned", () => expect(verificationOverallStatus([spec])).toBe("planned"));
  it("prioritizes conflict over stale and insufficient", () => expect(verificationOverallStatus([spec], [result("stale"), result("insufficient"), result("conflicted")])).toBe("conflicted"));
  it("keeps the spec free of mutable result fields", () => expect(spec).not.toHaveProperty("status"));
});
