import { describe, expect, it } from "vitest";

import {
  evaluateApprovalPreparationText,
  resolveApprovalPolicySnapshot,
} from "../../../../core/approval";

const dutiesUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
const definitionUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031805825";
const thresholdUrl = "https://law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000070098";

const conciseCorrectedClaim = [
  "「방문판매 등에 관한 법률」상 계속거래에 해당하고 법령에서 정한 금액·기간 요건을 충족하는 계약에서는 사업자가 주요 계약 내용을 설명하고 계약서를 발급해야 합니다. 또한 해당 법률은 계약 해지·해제로 발생한 손실을 현저히 초과하는 위약금 청구와 부당한 환급 거부를 제한하고 있습니다.",
  "다만 모든 자동결제나 구독 서비스가 방문판매법상 계속거래에 해당하는 것은 아닙니다. 적용 여부는 계약 기간, 환급·위약금 약정, 거래 형태와 다른 법률의 적용 여부에 따라 달라질 수 있으므로 계약서와 사업자의 공식 안내를 함께 확인하세요.",
  "정보 기준일은 2026년 8월 1일입니다.",
].join(" ");

describe("approval concise continuing-transaction wording", () => {
  it("accepts the user-approved concise qualification with verified official source roles", () => {
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    expect(evaluateApprovalPreparationText(conciseCorrectedClaim, snapshot, {
      sourceUrls: [dutiesUrl, definitionUrl, thresholdUrl],
      reviewedAt: "2026-08-02T00:00:00.000Z",
    })).toEqual([]);
  });
});
