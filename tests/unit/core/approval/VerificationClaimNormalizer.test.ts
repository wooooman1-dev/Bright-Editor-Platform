import { describe, expect, it } from "vitest";
import { normalizeVerificationValue } from "../../../../core/approval";
describe("Verification normalized values", () => {
  it("preserves discriminated kinds and money basis/comparator", () => {
    const value = normalizeVerificationValue("money", { kind: "money", value: { amount: 100, currency: "KRW", basis: "monthly", comparator: "gte" } });
    expect(value).toEqual({ kind: "money", value: { amount: 100, currency: "KRW", basis: "monthly", comparator: "gte" } });
  });
  it("keeps ratio representations distinct", () => expect(normalizeVerificationValue("ratio", { kind: "ratio", value: { value: 0.3, representation: "fraction", meaning: "rate" } }).kind).toBe("ratio"));
  it("canonicalizes eligibility AND/OR ordering", () => {
    const first = normalizeVerificationValue("eligibility", { kind: "eligibility", value: { predicate: { all: [{ field: "b", operator: "eq", value: 2 }, { field: "a", operator: "eq", value: 1 }] } } });
    const second = normalizeVerificationValue("eligibility", { kind: "eligibility", value: { predicate: { all: [{ field: "a", operator: "eq", value: 1 }, { field: "b", operator: "eq", value: 2 }] } } });
    expect(first).toEqual(second);
  });
  it("rejects a mismatched discriminant", () => expect(() => normalizeVerificationValue("date", { kind: "money", value: { amount: 1, currency: "KRW", basis: "total" } })).toThrow());
});
