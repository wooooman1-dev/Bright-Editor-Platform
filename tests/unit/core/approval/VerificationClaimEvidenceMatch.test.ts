import { describe, expect, it } from "vitest";
import {
  evaluateVerificationClaimEvidenceMatch,
  type VerificationClaimSpec,
} from "../../../../core/approval";

const legalClaim: VerificationClaimSpec = {
  claimId: "claim-fixed-date",
  field: "확정일자 법적 적용",
  kind: "legal",
  statement: "확정일자의 법적 효과는 주택임대차 관련 법령이 정한 요건과 사실관계에 따라 판단된다.",
  qualifiers: {
    subject: "주택 임대차계약의 확정일자",
    scope: "대한민국 법령 적용 범위",
    basis: "현행 주택임대차 관련 법령",
  },
  temporalRequirement: { mode: "current" },
  required: true,
  risk: "critical",
};

const fixedDateExcerpt = "제3조의2(보증금의 회수) ② 대항요건과 임대차계약증서상의 확정일자를 갖춘 임차인은 후순위권리자보다 우선하여 보증금을 변제받을 권리가 있다.";
const reportingExcerpt = "제6조의2(주택 임대차 계약의 신고) ① 임대차계약당사자는 대통령령으로 정하는 금액을 초과하는 임대차 계약을 체결한 경우 신고하여야 한다. ② 주택 임대차 계약의 신고는 대통령령으로 정하는 지역에 적용한다.";

function match(overrides: Partial<Parameters<typeof evaluateVerificationClaimEvidenceMatch>[0]> = {}) {
  return evaluateVerificationClaimEvidenceMatch({
    spec: legalClaim,
    submittedValue: legalClaim.statement,
    evidenceExcerpt: fixedDateExcerpt,
    pageText: `주택임대차보호법 ${fixedDateExcerpt}`,
    normalizedValuePresent: true,
    normalizedValueMatchesPlanned: true,
    ...overrides,
  });
}

describe("VerificationClaimEvidenceMatch", () => {
  it("binds a Planning proposition to a verbatim authoritative excerpt without requiring the provider paraphrase to appear", () => {
    expect(match()).toEqual({ matched: true, diagnostics: [] });
  });

  it("does not let a related but different legal Claim satisfy the planned Claim", () => {
    const result = match({
      evidenceExcerpt: reportingExcerpt,
      pageText: `부동산 거래신고 등에 관한 법률 ${reportingExcerpt}`,
    });
    expect(result.matched).toBe(false);
    expect(result.diagnostics).toContain("claim_value_not_found");
  });

  it("does not block a scalar Claim when the source contains a different numeric literal", () => {
    const amountClaim: VerificationClaimSpec = {
      claimId: "claim-amount",
      field: "지원 금액",
      kind: "money",
      statement: "지원 금액은 50만원이다.",
      rawValue: "50만원",
      qualifiers: { subject: "지원 금액" },
      required: true,
      risk: "critical",
      temporalRequirement: { mode: "notRequired" },
    };
    const excerpt = "공식 안내에 따르면 지원 금액은 100만원이다.";
    expect(match({
      spec: amountClaim,
      submittedValue: "100만원",
      evidenceExcerpt: excerpt,
      pageText: excerpt,
      normalizedValueMatchesPlanned: false,
    })).toMatchObject({
      matched: true,
      diagnostics: ["claim_raw_value_mismatch_ignored"],
    });
  });

  it("requires the evidence excerpt itself to exist in the fetched page", () => {
    expect(match({ pageText: "주택임대차보호법의 다른 조문" })).toMatchObject({
      matched: false,
      diagnostics: expect.arrayContaining(["claim_evidence_excerpt_not_found"]),
    });
  });
});
