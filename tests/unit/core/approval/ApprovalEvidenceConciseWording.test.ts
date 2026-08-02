import { describe, expect, it } from "vitest";

import {
  extractProfileApprovalFactsFromText,
} from "../../../../core/approval";

const conciseClaim = "「방문판매 등에 관한 법률」상 계속거래에 해당하고 법령에서 정한 금액·기간 요건을 충족하는 계약에서는 사업자가 주요 계약 내용을 설명하고 계약서를 발급해야 합니다.";

describe("approval concise legal Evidence extraction", () => {
  it("extracts the Article 30 threshold role when the official threshold qualifier precedes the duty", () => {
    const fields = extractProfileApprovalFactsFromText(conciseClaim, "wordpress_life_economy_v1")
      .map((fact) => fact.field);
    expect(fields).toContain("continuingTransactionArticle30Threshold");
    expect(fields).toContain("continuingTransactionContractDocument");
  });
});
