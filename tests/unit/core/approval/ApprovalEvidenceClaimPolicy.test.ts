import { describe, expect, it } from "vitest";

import {
  approvalEvidenceClaimFieldsForSourceUrl,
  approvalFactMatchesPage,
  extractProfileApprovalFacts,
  requiredApprovalFactFields,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

function retirementDocument(): ContentDocument {
  return {
    id: "retirement-1",
    title: "퇴직금 계산 방법과 계산 전 확인할 조건",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-31T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-07-31T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
    },
    blocks: [
      { id: "p1", type: "paragraph", text: "계속근로기간이 1년 이상인지 먼저 확인합니다." },
      { id: "p2", type: "paragraph", text: "평균임금: 퇴직 전 3개월 임금 총액을 그 기간의 총일수로 나눕니다." },
      { id: "p3", type: "paragraph", text: "퇴직금은 1년에 대해 30일분의 평균임금으로 계산합니다." },
      { id: "p4", type: "paragraph", text: "퇴직 후 14일 이내 지급이 원칙입니다." },
      { id: "p5", type: "paragraph", text: "육아휴직 기간은 평균임금 산정에서 별도 확인이 필요합니다." },
    ],
  };
}

function depositProtectionDocument(): ContentDocument {
  return {
    ...retirementDocument(),
    id: "deposit-protection-1",
    title: "예금자보호 확인 방법",
    blocks: [
      { id: "p1", type: "paragraph", text: "예금자보호 대상 금융상품인지 먼저 확인합니다." },
      { id: "p2", type: "paragraph", text: "원금과 이자를 합해 1인당 금융회사별 1억원까지 보호 한도를 확인합니다." },
      { id: "p3", type: "paragraph", text: "예금보험공사 또는 금융회사 상품설명서에서 예금보험관계 표시를 확인합니다." },
      { id: "p4", type: "paragraph", text: "2025년 9월 1일부터 적용되는 기준인지 확인합니다." },
      { id: "p5", type: "paragraph", text: "예금자보호법의 적용 범위와 보호 제외 상품도 확인합니다." },
    ],
  };
}

function continuingTransactionDocument(): ContentDocument {
  return {
    ...retirementDocument(),
    id: "continuing-transaction-1",
    title: "고정지출 줄이는 방법",
    blocks: [
      {
        id: "definition",
        type: "paragraph",
        text: "방문판매법상 계속거래는 1개월 이상 계속적으로 재화나 서비스를 공급하고, 중도 해지 시 대금 환급 제한 또는 위약금 약정이 있는 거래를 말합니다.",
      },
      {
        id: "scope",
        type: "paragraph",
        text: "매달 결제된다는 이유만으로 모든 자동결제나 구독 서비스가 방문판매법상 계속거래에 해당하는 것은 아닙니다.",
      },
      {
        id: "article-30",
        type: "paragraph",
        text: "방문판매법상 계속거래 가운데 법 제30조의 사전 설명과 계약서 발급 의무는 시행령에서 정한 금액 10만원 및 기간 3개월 이상의 계약에 적용됩니다.",
      },
      {
        id: "article-32",
        type: "paragraph",
        text: "계속거래 계약을 해지·해제할 때 손실을 현저히 초과하는 위약금을 청구하거나 실제 공급분을 초과해 받은 대금의 환급을 부당하게 거부해서는 안 됩니다.",
      },
    ],
  };
}

describe("Approval Evidence Claim Policy", () => {
  it("extracts retirement-pay Claim fields instead of artwork-only metadata", () => {
    const document = retirementDocument();
    const facts = extractProfileApprovalFacts(document, "wordpress_life_economy_v1");
    const fields = new Set(facts.map((fact) => fact.field));
    expect(fields).toContain("continuousServicePeriod");
    expect(fields).toContain("averageWage");
    expect(fields).toContain("retirementPayFormula");
    expect(fields).toContain("paymentDeadline");
  });

  it("requires all critical retirement-pay Claim fields", () => {
    const document = retirementDocument();
    const facts = extractProfileApprovalFacts(document, "wordpress_life_economy_v1");
    expect(requiredApprovalFactFields(document, "wordpress_life_economy_v1", facts)).toEqual(
      expect.arrayContaining([
        "continuousServicePeriod",
        "averageWage",
        "retirementPayFormula",
        "paymentDeadline",
      ]),
    );
  });

  it("extracts and requires the critical deposit-protection Claim fields", () => {
    const document = depositProtectionDocument();
    const facts = extractProfileApprovalFacts(document, "wordpress_life_economy_v1");
    const fields = new Set(facts.map((fact) => fact.field));

    expect([...fields]).toEqual(expect.arrayContaining([
      "depositProtectedProducts",
      "depositProtectionLimit",
      "depositProtectionUnit",
      "depositProtectionExclusions",
      "depositProtectionCheckPath",
      "depositProtectionEffectiveDate",
      "depositProtectionStatutoryBasis",
    ]));
    expect(requiredApprovalFactFields(document, "wordpress_life_economy_v1", facts)).toEqual(
      expect.arrayContaining([
        "depositProtectedProducts",
        "depositProtectionLimit",
        "depositProtectionUnit",
        "depositProtectionExclusions",
        "depositProtectionCheckPath",
        "depositProtectionEffectiveDate",
        "depositProtectionStatutoryBasis",
      ]),
    );
  });

  it("assigns each canonical deposit-protection source only its supported Claim roles", () => {
    expect(approvalEvidenceClaimFieldsForSourceUrl("https://www.kdic.or.kr/sp/dpstrprot/selectProtSystProtTrgtPrdctSumr.do"))
      .toEqual(["depositProtectedProducts", "depositProtectionExclusions"]);
    expect(approvalEvidenceClaimFieldsForSourceUrl("https://www.kdic.or.kr/sp/dpstrprot/ProtSystProtLmts/selectScrn.do"))
      .toEqual(["depositProtectionLimit", "depositProtectionUnit"]);
    expect(approvalEvidenceClaimFieldsForSourceUrl("https://www.kdic.or.kr/sp/dpstrprot/ProtSystProtGudn/selectScrn.do"))
      .toEqual(["depositProtectionCheckPath"]);
    expect(approvalEvidenceClaimFieldsForSourceUrl("https://www.fsc.go.kr/po020201/84975"))
      .toEqual(expect.arrayContaining(["depositProtectedProducts", "depositProtectionExclusions", "depositProtectionCheckPath"]));
    expect(approvalEvidenceClaimFieldsForSourceUrl("https://www.fsc.go.kr/no010101/84974"))
      .toEqual(["depositProtectionLimit", "depositProtectionUnit", "depositProtectionEffectiveDate"]);
    expect(approvalEvidenceClaimFieldsForSourceUrl("https://www.law.go.kr/LSW/lsInfoP.do?efYd=20260102&lsiSeq=277269"))
      .toEqual(expect.arrayContaining(["depositProtectionEffectiveDate", "depositProtectionStatutoryBasis"]));
  });

  it("extracts and requires the continuing-transaction definition, Article 30 threshold, and Article 32 Claims", () => {
    const document = continuingTransactionDocument();
    const facts = extractProfileApprovalFacts(document, "wordpress_life_economy_v1");

    expect(facts.map((fact) => fact.field)).toEqual(expect.arrayContaining([
      "continuingTransactionDefinition",
      "continuingTransactionArticle30Threshold",
      "continuingTransactionContractDocument",
      "excessiveTerminationPenalty",
      "excessPaymentRefund",
    ]));
    expect(requiredApprovalFactFields(document, "wordpress_life_economy_v1", facts)).toEqual([
      "continuingTransactionDefinition",
      "continuingTransactionArticle30Threshold",
      "continuingTransactionContractDocument",
      "excessiveTerminationPenalty",
      "excessPaymentRefund",
    ]);
  });

  it("assigns the definition, enforcement-decree threshold, and Article 30·32 pages to separate Claim roles", () => {
    expect(approvalEvidenceClaimFieldsForSourceUrl(
      "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031805825",
    )).toEqual(["continuingTransactionDefinition"]);
    expect(approvalEvidenceClaimFieldsForSourceUrl(
      "https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000070098",
    )).toEqual(["continuingTransactionArticle30Threshold"]);
    expect(approvalEvidenceClaimFieldsForSourceUrl(
      "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501",
    )).toEqual([
      "continuingTransactionContractDocument",
      "excessiveTerminationPenalty",
      "excessPaymentRefund",
    ]);
  });

  /**
   * 2026-09-05 실측(content-mtnqhijd-f1m7e0, 주휴수당 조건): statutoryBasis는
   * "근로자퇴직급여보장법·근로기준법·소득세법" 중 하나를 추출하는데, 검증
   * 신호는 "근로자퇴직급여보장법" 하나로 고정되어 있어 근로기준법을 인용한
   * 원고는 완벽한 출처를 대도 영원히 검증되지 않았다.
   */
  it("verifies statutoryBasis against whichever statute the extracted fact actually names", () => {
    const laborStandardsFact = {
      field: "statutoryBasis",
      value: "근로기준법상 근로자가 4주 평균하여 1주 소정근로시간이 15시간 이상이고 1주간의 소정근로일을 개근했을 때 발생합니다.",
    };
    const page = {
      title: ":: 고용노동부 모바일페이지 고객센터 ::",
      publisher: "1350.moel.go.kr",
      text: "근로기준법 제55조제1항 등에 따라 주휴수당은 ①근로기준법상 근로자로서 …",
    };
    expect(approvalFactMatchesPage(page, laborStandardsFact)).toBe(true);

    const retirementFact = { field: "statutoryBasis", value: "근로자퇴직급여보장법에 따라 계산합니다." };
    expect(approvalFactMatchesPage(page, retirementFact)).toBe(false);
  });

  /**
   * amount/exceptions는 키워드 뒤에 오는 글자를 그대로 값으로 잡는다. 2026-09-05
   * 실측: "이 순서의 목적은 금액을 먼저 추정하는 데 있지 않습니다"에서 amount가
   * "을 먼저 추정하는 데 있지 않습니다"를 값으로 잡아, 어떤 출처를 대도 검증될
   * 수 없는 조각이 필수 근거로 등록됐다. "지원 대상: 만 19세 이상"처럼 흔한
   * 정책 문구는 계속 정상 추출되어야 한다.
   */
  it("does not register a sentence fragment as amount when the keyword is only the object of a negated clause", () => {
    const document: ContentDocument = {
      ...retirementDocument(),
      id: "weekly-holiday-pay-1",
      title: "주휴수당 조건",
      blocks: [
        { id: "p1", type: "paragraph", text: "이 순서의 목적은 금액을 먼저 추정하는 데 있지 않습니다." },
        { id: "p2", type: "paragraph", text: "지원 대상: 만 19세 이상 거주자" },
        { id: "p3", type: "paragraph", text: "지원 금액: 100만원" },
      ],
    };
    const facts = extractProfileApprovalFacts(document, "wordpress_life_economy_v1");
    const amountValues = facts.filter((fact) => fact.field === "amount").map((fact) => fact.value);
    expect(amountValues).toEqual(["100만원"]);
    expect(facts.find((fact) => fact.field === "eligibility")?.value).toBe("만 19세 이상 거주자");
  });

  /** "그 주의", "여러 주의"처럼 "주(week)"+조사 "의"가 "주의사항"으로 오인되면 안 된다. */
  it("does not mistake a week's possessive '주의' for the word 주의(사항) in exceptions", () => {
    const document: ContentDocument = {
      ...retirementDocument(),
      id: "weekly-holiday-pay-2",
      title: "주휴수당 조건",
      blocks: [
        { id: "p1", type: "paragraph", text: "이후 여러 주의 표가 같은 방식으로 이어졌는지 봅니다." },
        { id: "p2", type: "paragraph", text: "주의사항: 중도해지 시 공제되지 않습니다." },
      ],
    };
    const facts = extractProfileApprovalFacts(document, "wordpress_life_economy_v1");
    const exceptionsValues = facts.filter((fact) => fact.field === "exceptions").map((fact) => fact.value);
    expect(exceptionsValues).toEqual(["중도해지 시 공제되지 않습니다"]);
  });
});
