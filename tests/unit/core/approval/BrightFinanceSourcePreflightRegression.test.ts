import { describe, expect, it } from "vitest";

import { scopeApprovalSourcePreflightRequirements } from "../../../../core/approval/ApprovalSourcePreflightClaimScope";
import { requiredApprovalSourcePreflightClaims } from "../../../../core/approval/ApprovalSourcePreflightCoverage";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
} from "../../../../core/content";

describe("Bright Finance Source Preflight regression", () => {
  it("does not turn a related deposit-protection link into mandatory factual Claims for a deposit-vs-savings comparison", () => {
    const candidate = createContentOpportunityCandidate({
      sourceRequest: "예금과 적금 차이 비교 및 선택 기준 글을 작성해줘",
      selectionMode: "userSpecified",
      selectedTopic: "예금과 적금 차이 비교 및 선택 기준",
      primaryKeyword: "예금 적금 차이 비교",
      secondaryKeywords: [
        "예금 적금 차이",
        "예금 적금 선택",
        "예금 적금 뭐가 좋을까",
        "목돈 예금 적금",
        "예금 적금 금리 계산",
      ],
      searchIntent: "목돈이 있거나 매달 저축할 돈이 있는 독자가 예금과 적금의 구조 차이를 이해하고, 자신의 자금 목적과 납입 방식에 맞는 상품 유형을 선택하려는 질문을 해결한다.",
      audience: "저축을 시작하려 하지만 예금과 적금의 차이, 목돈 운용 방식, 월 납입 방식의 차이를 명확히 모르는 일반 독자",
      contentType: "article",
      contentAngle: "가입 전 자금 목적과 납입 구조에 따른 선택 기준을 설명한다.",
      readerProblem: "독자는 금리 숫자만 비교하다가 실제로는 목돈 보유 여부, 자금 사용 시점, 매월 납입 가능성에 따라 달라지는 선택 기준을 놓치기 쉽다.",
      expectedCoverage: [
        "예금과 적금의 납입 구조 차이",
        "목돈 보유 여부에 따른 기본 선택 방향",
        "사용 예정일이 있는 자금과 비상자금의 구분",
        "금리 숫자를 볼 때 납입 방식과 기간을 함께 봐야 하는 이유",
        "중도해지 가능성과 자금 유동성 확인 방법",
        "예금자보호 확인 콘텐츠와 연결되는 금융회사별 예금 합산 점검 필요성",
      ],
      selectionRationale: "예금과 적금 가입 전 선택을 돕는 비교 콘텐츠",
      opportunityEvidence: [{ source: "unknown", summary: "확정 Planning" }],
      confidence: 0.8,
      cautions: [],
      projectId: "project-bright-finance-regression",
    });
    const opportunity = confirmContentOpportunity(candidate, {
      workspaceId: "workspace-bright-finance-regression",
      projectId: "project-bright-finance-regression",
      contentId: "content-msfdf4oe-qyvoso",
      confirmedAt: "2026-08-05T00:50:51.521Z",
    });

    const derived = requiredApprovalSourcePreflightClaims(
      opportunity,
      "wordpress_life_economy_v1",
    );
    const derivedFields = derived.map((claim) => claim.field);

    expect(derivedFields).toContain("depositProtectionLimit");
    expect(derivedFields).toContain("interestRate");
    expect(scopeApprovalSourcePreflightRequirements(opportunity, derived)).toEqual([]);
  });
});
