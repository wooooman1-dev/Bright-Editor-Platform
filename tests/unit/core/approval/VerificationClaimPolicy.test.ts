import { describe, expect, it } from "vitest";
import { evaluateVerificationClaim, type VerificationClaimSpec, type VerificationSourceAssessment } from "../../../../core/approval";
const spec: VerificationClaimSpec = { claimId: "c", field: "x", kind: "money", statement: "x", qualifiers: {}, required: true };
const source = (group: string, role: VerificationSourceAssessment["role"], authoritative: boolean, value = 1): VerificationSourceAssessment => ({ sourceId: group, institutionGroupId: group, role, authoritative, supports: true, fresh: true, freshnessStatus: "fresh", normalizedValue: { kind: "money", value: { amount: value, currency: "KRW", basis: "total" } }, diagnostics: [] });
const input = (sources: readonly VerificationSourceAssessment[], conflict = false) => ({ claimId: "c", normalizedValue: sources[0]?.normalizedValue, sourceAssessments: sources, unresolvedConflict: conflict, freshnessPassed: true, diagnostics: [] });
describe("Verification policy", () => {
  it("requires three institutions and two authoritative institutions", () => expect(evaluateVerificationClaim(spec, input([source("a", "primaryOfficial", true), source("b", "officialCorroborating", true)])).status).toBe("insufficient"));
  it("verifies a high-risk claim only with the complete policy", () => expect(evaluateVerificationClaim(spec, input([source("a", "primaryOfficial", true), source("b", "officialCorroborating", true), source("c", "independentCorroborating", false)])).status).toBe("verified"));
  it("makes primary conflict authoritative and blocks verification", () => expect(evaluateVerificationClaim(spec, input([source("a", "primaryOfficial", true, 1), source("b", "officialCorroborating", true, 2), source("c", "independentCorroborating", false, 2)], true)).status).toBe("conflicted"));
  it("makes stale status lower priority than conflict", () => expect(evaluateVerificationClaim(spec, { ...input([], true), freshnessPassed: false }).status).toBe("conflicted"));
  it("does not accept a source-family count as institution count", () => expect(evaluateVerificationClaim(spec, input([source("a", "primaryOfficial", true), source("a", "officialCorroborating", true), source("b", "independentCorroborating", false)])).status).toBe("insufficient"));
  it("excludes unknown and stale assessments from verification counts without letting one stale source dominate a mixed insufficient result", () => {
    const unknown = { ...source("unknown", "primaryOfficial", true), fresh: false, freshnessStatus: "unknown" as const };
    const stale = { ...source("stale", "officialCorroborating", true), fresh: false, freshnessStatus: "stale" as const };
    const result = evaluateVerificationClaim(spec, input([source("fresh", "primaryOfficial", true), unknown, stale]));
    expect(result.independentInstitutionCount).toBe(1);
    expect(result.authoritativeInstitutionCount).toBe(1);
    expect(result.status).toBe("insufficient");
  });
  it("keeps a high-risk Claim verified when complete fresh evidence exists alongside stale evidence", () => {
    const stale = { ...source("old", "officialCorroborating", true), fresh: false, freshnessStatus: "stale" as const };
    const result = evaluateVerificationClaim(spec, input([
      source("a", "primaryOfficial", true),
      source("b", "officialCorroborating", true),
      source("c", "independentCorroborating", false),
      stale,
    ]));
    expect(result.status).toBe("verified");
    expect(result.freshnessPassed).toBe(true);
    expect(result.independentInstitutionCount).toBe(3);
  });
  it("reports stale when no usable fresh evidence exists and the Claim is supported only by expired evidence", () => {
    const stale = { ...source("old", "primaryOfficial", true), fresh: false, freshnessStatus: "stale" as const };
    expect(evaluateVerificationClaim(spec, input([stale])).status).toBe("stale");
  });
});
