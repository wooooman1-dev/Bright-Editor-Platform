import { describe, expect, it } from "vitest";

import {
  extractProfileApprovalFactsFromText,
} from "../../../../core/approval";

const conciseClaim = [
  "「방문판매 등에 관한 법률」상 계속거래에 해당하고 법령에서 정한 금액·기간 요건을 충족하는 계약에서는 사업자가 주요 계약 내용을 설명하고 계약서를 발급해야 합니다. 또한 해당 법률은 계약 해지·해제로 발생한 손실을 현저히 초과하는 위약금 청구와 부당한 환급 거부를 제한하고 있습니다.",
  "다만 모든 자동결제나 구독 서비스가 방문판매법상 계속거래에 해당하는 것은 아닙니다.",
].join(" ");

describe("approval concise legal Evidence extraction", () => {
  it("extracts all official source roles used by the user-approved concise wording", () => {
    const fields = extractProfileApprovalFactsFromText(conciseClaim, "wordpress_life_economy_v1")
      .map((fact) => fact.field);
    expect(fields).toEqual(expect.arrayContaining([
      "continuingTransactionDefinition",
      "continuingTransactionArticle30Threshold",
      "continuingTransactionContractDocument",
      "excessiveTerminationPenalty",
      "excessPaymentRefund",
    ]));
  });
});
