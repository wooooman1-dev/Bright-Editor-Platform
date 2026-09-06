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

  /**
   * 판정은 "지어냈는가" 하나만 본다 (D-045). 발췌가 다른 주제를 다룬다는 판단은
   * 출처 내용과 기획을 대조하는 일이므로 진단으로만 남기고 막지 않는다.
   */
  it("reports a related but different legal Claim without refusing it", () => {
    const result = match({
      evidenceExcerpt: reportingExcerpt,
      pageText: `부동산 거래신고 등에 관한 법률 ${reportingExcerpt}`,
    });
    expect(result.matched).toBe(true);
    expect(result.diagnostics).toContain("claim_value_not_found");
  });

  /**
   * 기획이 적은 rawValue 와 출처의 값이 다르면 출처를 따른다 (50656c7). 어긋난
   * 사실은 진단에 남는다.
   */
  it("prefers the discovered scalar over the planned one and records the difference", () => {
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
      diagnostics: expect.arrayContaining(["claim_raw_value_mismatch"]),
    });
  });

  it("requires the evidence excerpt itself to exist in the fetched page", () => {
    expect(match({ pageText: "주택임대차보호법의 다른 조문" })).toMatchObject({
      matched: false,
      diagnostics: expect.arrayContaining(["claim_evidence_excerpt_not_found"]),
    });
  });
});

describe("one rule for whether the page carries the excerpt", () => {
  /**
   * Preflight 와 Coverage 는 evidenceExcerptAnchored 로 이 질문을 본다. 모델의
   * 인용과 서버의 추출이 살아 있는 페이지를 각자 읽은 결과라 글자 하나까지
   * 같기를 요구할 수 없기 때문이다. 이 검사만 정확 부분문자열을 요구했다.
   *
   * 2026-08-26 밝은재테크 실측: 선택약정 원고의 '선택약정 재가입 대상' 이
   * claim_evidence_excerpt_not_found 로 값을 잃었는데, 같은 출처의 발췌에는
   * 페이지 본문이 충분히 들어와 있었다. 못 읽은 것도 지어낸 것도 아니고 두
   * 추출이 줄바꿈과 목록 기호에서 갈린 것이다.
   */
  const eligibilityClaim: VerificationClaimSpec = {
    claimId: "claim-reapply",
    field: "선택약정 재가입 대상",
    kind: "eligibility",
    statement: "선택약정 할인 재가입의 현행 회선 및 단말기 대상 조건을 확인해야 한다.",
    qualifiers: { subject: "이용자", scope: "요금 할인", basis: "공식 안내" },
    temporalRequirement: { mode: "notRequired" },
    required: true,
    risk: "critical",
  };
  const quoted = "“통신요금의 부담을 덜으세요”\n[신청대상]\n① 대리점 판매점에서 새 단말기를 구입하는 이용자";
  const extracted = "통신요금의 부담을 덜으세요 [ 신청대상 ] ① 대리점 · 판매점에서 새 단말기를 구입하는 이용자 입니다.";

  function reapply(evidenceExcerpt: string, pageText: string) {
    return evaluateVerificationClaimEvidenceMatch({
      spec: eligibilityClaim,
      submittedValue: "대리점 판매점에서 새 단말기를 구입하는 이용자",
      evidenceExcerpt,
      pageText,
      normalizedValuePresent: true,
      normalizedValueMatchesPlanned: true,
    });
  }

  it("accepts a quote the server's own extraction split on line breaks and list marks", () => {
    expect(reapply(quoted, extracted).matched).toBe(true);
  });

  it("still refuses a quote the page does not carry", () => {
    const result = reapply("이 문장은 페이지 어디에도 없는 완전히 새로운 내용입니다.", extracted);

    expect(result.matched).toBe(false);
    expect(result.diagnostics).toContain("claim_evidence_excerpt_not_found");
  });

  it("still refuses a quote that mixes in words the page never uses", () => {
    expect(reapply("통신요금의 부담을 덜으세요 존재하지않는문장조각입니다", extracted).matched).toBe(false);
  });
});
