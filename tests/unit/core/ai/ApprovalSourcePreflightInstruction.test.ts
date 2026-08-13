import { describe, expect, it } from "vitest";
import { withApprovalSourcePreflightInstruction } from "../../../../core/ai/ApprovalSourcePreflight";
import type { AIWebSource } from "../../../../core/ai/AIProvider";
import type { VerificationGenerationClaimSourceProjection } from "../../../../core/approval/VerificationGenerationEvidence";

const sourceUrl = "https://www.gov.kr/approval-source-preflight-instruction";

const webSource: AIWebSource = Object.freeze({
  url: sourceUrl,
  title: "생활 지원 안내",
  excerpt: "월 지원 금액은 50만원입니다.",
  provenance: "citation" as const,
});

const verificationClaim: VerificationGenerationClaimSourceProjection = Object.freeze({
  claimId: "support-monthly",
  field: "지원 금액",
  kind: "money" as const,
  statement: "월 지원 금액은 50만원이다.",
  required: true,
  normalizedValue: Object.freeze({
    kind: "money" as const,
    value: Object.freeze({ amount: 500_000, currency: "KRW", basis: "monthly" as const }),
  }),
  qualifiers: Object.freeze({ basis: "monthly" as const }),
  source: Object.freeze({
    sourceId: "gov-primary",
    canonicalUrl: sourceUrl,
    role: "primaryOfficial" as const,
    authoritative: true,
    evidenceExcerpt: "월 지원 금액은 50만원입니다.",
  }),
});

/**
 * The unverified-number bullet is preventive, not a Gate relaxation. A cadence
 * or example period written as `1주` reaches the Claim binding Gate as an
 * unverifiable high-risk duration, so Generation is instructed to write it as
 * prose. Both instruction branches feed Generation, so both must carry it.
 */
describe("Approval source preflight Generation instruction", () => {
  it("returns the instruction unchanged when no source is attached", () => {
    expect(withApprovalSourcePreflightInstruction("base", [], [])).toBe("base");
  });

  it("tells Generation to write an unverified number as prose in the canonical bundle", () => {
    const instruction = withApprovalSourcePreflightInstruction(
      "base",
      [webSource],
      [{
        url: sourceUrl,
        claims: [],
        verificationClaims: [verificationClaim],
      }],
    );

    expect(instruction).toContain("Explicit verification Generation bundle");
    expect(instruction).toContain(
      "Write an unverified number — an example, a cadence, an approximation, or an illustrative period — as descriptive prose instead of a compressed numeral-and-unit form",
    );
    expect(instruction).toContain('rather than "1주"');
    expect(instruction).toContain(
      "This never applies to a Claim-ID-owned normalizedValue, which must stay exactly as the canonical Claim contract represents it.",
    );
  });

  it("tells Generation to write an unverified number as prose in the preflight bundle", () => {
    const instruction = withApprovalSourcePreflightInstruction(
      "base",
      [webSource],
      [{
        url: sourceUrl,
        claims: [{
          field: "지원 금액",
          value: "월 50만원",
          evidenceExcerpt: "월 지원 금액은 50만원입니다.",
        }],
      }],
    );

    expect(instruction).toContain("Approval source preflight bundle");
    expect(instruction).toContain(
      "Write an unverified number — an example, a cadence, an approximation, or an illustrative period — as descriptive prose instead of a compressed numeral-and-unit form",
    );
    expect(instruction).toContain('rather than "1주"');
    expect(instruction).toContain(
      "This never applies to a verified Claim value, which must stay exactly as attached above.",
    );
  });

  it("keeps the verified-value preservation rule alongside the prose rule", () => {
    const instruction = withApprovalSourcePreflightInstruction(
      "base",
      [webSource],
      [{
        url: sourceUrl,
        claims: [{
          field: "지원 금액",
          value: "월 50만원",
          evidenceExcerpt: "월 지원 금액은 50만원입니다.",
        }],
      }],
    );

    expect(instruction).toContain(
      "Do not change a verified date, amount, percentage, duration, unit,",
    );
    expect(instruction).toContain("Verified value: 월 50만원");
  });
});
