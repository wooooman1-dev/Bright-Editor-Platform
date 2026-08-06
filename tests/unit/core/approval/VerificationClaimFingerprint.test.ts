import { describe, expect, it } from "vitest";
import { verificationPlanFingerprint } from "../../../../core/approval";
const base = { claimId: "c", field: "x", kind: "money" as const, statement: "x", qualifiers: {}, required: true };
describe("Verification fingerprints", () => {
  it("ignores logical array order", () => expect(verificationPlanFingerprint([{ ...base, claimId: "b" }, { ...base, claimId: "a" }])).toBe(verificationPlanFingerprint([{ ...base, claimId: "a" }, { ...base, claimId: "b" }])));
  it("changes when a qualifier changes", () => expect(verificationPlanFingerprint([base])).not.toBe(verificationPlanFingerprint([{ ...base, qualifiers: { basis: "monthly" } }])));
});
