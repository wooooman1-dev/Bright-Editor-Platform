import { describe, expect, it } from "vitest";

import {
  approvalEvidenceClaimFieldsForSourceUrl,
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
});
