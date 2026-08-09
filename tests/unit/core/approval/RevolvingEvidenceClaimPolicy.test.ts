import { describe, expect, it } from "vitest";

import {
  approvalEvidenceClaimFieldsForSourceUrl,
  approvalFactMatchesPage,
  extractProfileApprovalFacts,
  requiredApprovalFactFields,
  type ApprovalEvidenceFact,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const fscGuide = "https://www.fsc.go.kr/no040101?cnId=2396";
const fscWarning = "https://www.fsc.go.kr/po020201/27315";
const fscReform = "https://www.fsc.go.kr/po010106/78357";

function document(): ContentDocument {
  return {
    id: "revolving",
    title: "신용카드 리볼빙 확인 방법",
    blocks: [
      { id: "p1", type: "paragraph", text: "리볼빙(일부결제금액이월약정)은 카드 대금 중 약정결제비율에 해당하는 일부 금액을 결제하고 나머지를 다음 달로 이월하는 방식입니다." },
      { id: "p2", type: "paragraph", text: "리볼빙은 할부와 다르며 이월잔액에는 높은 수수료율이 적용되어 부담이 증가할 수 있습니다." },
      { id: "p3", type: "paragraph", text: "금융회사는 리볼빙 설명서를 제공하고 수수료율 비교 안내와 최소결제비율 10%를 명확히 설명해야 합니다." },
      { id: "p4", type: "paragraph", text: "불필요하면 카드사 공식 안내에서 리볼빙 해지와 전액결제 방법을 확인하세요." },
    ],
  };
}

describe("revolving approval Evidence claims", () => {
  it("extracts and requires the revolving facts actually used by the manuscript", () => {
    const source = document();
    const facts = extractProfileApprovalFacts(source, "wordpress_life_economy_v1");
    const fields = facts.map((fact) => fact.field);
    expect(fields).toEqual(expect.arrayContaining([
      "revolvingDefinition",
      "revolvingInstallmentDifference",
      "revolvingPaymentStructure",
      "revolvingFeeRisk",
      "revolvingDisclosureDuty",
      "revolvingFeeDisclosure",
      "revolvingMinimumPaymentRatio",
      "revolvingCancellationGuidance",
    ]));
    expect(requiredApprovalFactFields(source, "wordpress_life_economy_v1", facts)).toEqual(expect.arrayContaining([
      "revolvingDefinition",
      "revolvingPaymentStructure",
      "revolvingFeeRisk",
      "revolvingDisclosureDuty",
      "revolvingMinimumPaymentRatio",
      "revolvingCancellationGuidance",
    ]));
  });

  it("maps each official FSC page only to the Claim roles it supports", () => {
    expect(approvalEvidenceClaimFieldsForSourceUrl(fscGuide)).toEqual(expect.arrayContaining([
      "revolvingDefinition",
      "revolvingInstallmentDifference",
      "revolvingPaymentStructure",
      "revolvingFeeRisk",
      "revolvingCancellationGuidance",
    ]));
    expect(approvalEvidenceClaimFieldsForSourceUrl(fscWarning)).toEqual([
      "revolvingDefinition",
      "revolvingFeeRisk",
    ]);
    expect(approvalEvidenceClaimFieldsForSourceUrl(fscReform)).toEqual(expect.arrayContaining([
      "revolvingDisclosureDuty",
      "revolvingFeeDisclosure",
      "revolvingMinimumPaymentRatio",
      "revolvingFeeRisk",
    ]));
  });

  it("matches the revolving Claim roles against official page content", () => {
    const facts: readonly ApprovalEvidenceFact[] = [
      { field: "revolvingDefinition", value: "리볼빙 정의" },
      { field: "revolvingPaymentStructure", value: "결제 구조" },
      { field: "revolvingFeeRisk", value: "수수료 부담" },
      { field: "revolvingDisclosureDuty", value: "설명의무" },
      { field: "revolvingFeeDisclosure", value: "수수료율 비교" },
      { field: "revolvingMinimumPaymentRatio", value: "최소결제비율 10%" },
      { field: "revolvingCancellationGuidance", value: "리볼빙 해지" },
    ];
    const guidePage = {
      title: "일부결제금액이월약정 리볼빙",
      publisher: "금융위원회",
      text: "일부결제금액이월약정은 결제비율에 따라 일부를 결제하고 나머지를 이월합니다. 리볼빙 수수료율이 높을 수 있으므로 해지 여부를 확인하십시오.",
    };
    const reformPage = {
      title: "리볼빙 설명 강화",
      publisher: "금융위원회",
      text: "리볼빙 설명서로 설명하고 수수료율 비교 정보를 제공하며 최소결제비율 10%를 안내합니다.",
    };
    for (const fact of facts.slice(0, 3)) expect(approvalFactMatchesPage(guidePage, fact)).toBe(true);
    expect(approvalFactMatchesPage(guidePage, facts[6])).toBe(true);
    for (const fact of facts.slice(3, 6)) expect(approvalFactMatchesPage(reformPage, fact)).toBe(true);
  });
});
