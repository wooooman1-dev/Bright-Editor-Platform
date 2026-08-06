import { describe, expect, it } from "vitest";
import { countAuthoritativeInstitutions, countIndependentInstitutions, hasPrimaryOfficial } from "../../../../core/approval";
const sources = [
  { institutionGroupId: "a", authoritative: true, role: "primaryOfficial" as const },
  { institutionGroupId: "a", authoritative: true, role: "primaryOfficial" as const },
  { institutionGroupId: "b", authoritative: true, role: "officialCorroborating" as const },
  { institutionGroupId: "c", authoritative: false, role: "independentCorroborating" as const },
];
describe("Verification source identity", () => {
  it("counts an institution group once despite multiple URLs", () => expect(countIndependentInstitutions(sources)).toBe(3));
  it("counts authoritative institution groups once", () => expect(countAuthoritativeInstitutions(sources)).toBe(2));
  it("detects a primary official source", () => expect(hasPrimaryOfficial(sources)).toBe(true));
});
