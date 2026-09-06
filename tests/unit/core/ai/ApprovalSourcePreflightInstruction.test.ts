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
  /**
   * 값을 넘겨도 생성이 "운영기관이 정한 대상에 한정됩니다" 처럼 값의 존재만
   * 서술하면 독자에게는 아무 숫자도 남지 않는다. 2026-08-26 실측:
   * 통신사 4곳 이름이 normalizedValue 에 들어 있었는데 본문은 그 문장이었다.
   */
  it("tells Generation to state the value instead of describing that a value exists", () => {
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

    expect(instruction).toContain("State the value in the sentence itself");
    expect(instruction).toContain("leaves the reader without the fact it came for");
  });
  /**
   * 서버가 실제로 읽어온 발췌가 Claim 판정과 무관하게 생성까지 가야 한다.
   * 2026-08-27 실측: law.go.kr 에서 읽어 문서에 저장까지 한
   * "임대차기간이 끝나기 6개월 전부터 2개월 전까지" 가 생성에는 가지 않았고,
   * canonical 분기가 sources 를 가드에만 쓰고 버렸기 때문이었다.
   */
  it("carries the fetched source passage into the canonical bundle, not only the verified Claims", () => {
    const passage = "임대인이 임대차기간이 끝나기 6개월 전부터 2개월 전까지의 기간에 갱신거절의 통지를 하지 아니하면";
    const instruction = withApprovalSourcePreflightInstruction(
      "base",
      [{ ...webSource, excerpt: passage }],
      [{
        url: sourceUrl,
        claims: [],
        verificationClaims: [{
          claimId: "claim-1",
          field: "지원 금액",
          kind: "money",
          statement: "월 지원 금액은 50만원이다.",
          required: true,
          normalizedValue: { kind: "money", value: { amount: 500_000, currency: "KRW", basis: "monthly" } },
          qualifiers: {},
          source: {
            sourceId: "source-1",
            canonicalUrl: sourceUrl,
            role: "primaryOfficial",
            authoritative: true,
            evidenceExcerpt: "월 지원 금액은 50만원입니다.",
          },
        }],
      }],
    );

    expect(instruction).toContain("Explicit verification Generation bundle");
    expect(instruction).toContain("Fetched official source passages");
    expect(instruction).toContain(passage);
    expect(instruction).toContain("Never write a number from your own knowledge");
    expect(instruction).toContain("Never fill a placeholder");
  });
});
