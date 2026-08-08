import { describe, expect, it } from "vitest";
import {
  canonicalizeVerificationSourceIdentity,
  countAuthoritativeInstitutions,
  countIndependentInstitutions,
  hasPrimaryOfficial,
} from "../../../../core/approval";

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

  it("creates a deterministic identity for a previously unseen public HTTPS domain", () => {
    const first = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://new-policy-source.example.kr/notices/2026/123",
      role: "officialCorroborating",
      authoritative: true,
    });
    const second = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://new-policy-source.example.kr/notices/2026/123",
      role: "officialCorroborating",
      authoritative: true,
    });

    expect(first).toBeDefined();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      canonicalUrl: "https://new-policy-source.example.kr/notices/2026/123",
      role: "officialCorroborating",
      authoritative: true,
    });
    expect(first?.sourceId).toMatch(/^approval-source-/u);
    expect(first?.institutionGroupId).toMatch(/^institution-/u);
  });

  it("groups www, mobile, and bare-host URLs from the same unseen institution together", () => {
    const bare = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://future-agency.go.kr/policy/a",
      role: "primaryOfficial",
      authoritative: true,
    });
    const www = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://www.future-agency.go.kr/policy/b",
      role: "officialCorroborating",
      authoritative: true,
    });
    const mobile = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://m.future-agency.go.kr/policy/c",
      role: "officialCorroborating",
      authoritative: true,
    });

    expect(bare?.institutionGroupId).toBeDefined();
    expect(www?.institutionGroupId).toBe(bare?.institutionGroupId);
    expect(mobile?.institutionGroupId).toBe(bare?.institutionGroupId);
    expect(new Set([bare?.sourceId, www?.sourceId, mobile?.sourceId]).size).toBe(3);
  });

  it("uses the final redirected URL as the canonical source identity", () => {
    const redirected = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://legacy-agency.go.kr/old-policy",
      finalUrl: "https://policy-center.go.kr/current-policy",
      role: "primaryOfficial",
      authoritative: true,
    });
    const direct = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://policy-center.go.kr/current-policy",
      role: "primaryOfficial",
      authoritative: true,
    });

    expect(redirected?.canonicalUrl).toBe("https://policy-center.go.kr/current-policy");
    expect(redirected?.sourceId).toBe(direct?.sourceId);
    expect(redirected?.institutionGroupId).toBe(direct?.institutionGroupId);
  });

  it("keeps different unseen institutions independent", () => {
    const first = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://agency-one.go.kr/policy",
      role: "primaryOfficial",
      authoritative: true,
    });
    const second = canonicalizeVerificationSourceIdentity({
      requestedUrl: "https://agency-two.or.kr/research",
      role: "independentCorroborating",
      authoritative: false,
    });

    expect(first?.institutionGroupId).not.toBe(second?.institutionGroupId);
    expect(first?.sourceId).not.toBe(second?.sourceId);
  });

  it("rejects non-HTTPS or malformed sources instead of throwing", () => {
    expect(canonicalizeVerificationSourceIdentity({
      requestedUrl: "http://future-agency.go.kr/policy",
      role: "primaryOfficial",
      authoritative: true,
    })).toBeUndefined();
    expect(canonicalizeVerificationSourceIdentity({
      requestedUrl: "not-a-url",
      role: "independentCorroborating",
      authoritative: false,
    })).toBeUndefined();
  });
});
