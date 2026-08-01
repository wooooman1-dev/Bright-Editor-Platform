import { describe, expect, it } from "vitest";

import {
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

    expect(fields).toEqual(expect.arrayContaining([
      "depositProtectedProducts",
      "depositProtectionLimit",
      "depositProtectionUnit",
      "depositProtectionCheckPath",
      "depositProtectionEffectiveDate",
      "depositProtectionStatutoryBasis",
    ]));
    expect(requiredApprovalFactFields(document, "wordpress_life_economy_v1", facts)).toEqual(
      expect.arrayContaining([
        "depositProtectedProducts",
        "depositProtectionLimit",
        "depositProtectionUnit",
        "depositProtectionCheckPath",
        "depositProtectionEffectiveDate",
        "depositProtectionStatutoryBasis",
      ]),
    );
  });
});
