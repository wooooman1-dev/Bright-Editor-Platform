import { describe, expect, it } from "vitest";

import { scopeApprovalSourcePreflightRequirements } from "../../../../core/approval/ApprovalSourcePreflightClaimScope";
import { requiredApprovalSourcePreflightClaims } from "../../../../core/approval/ApprovalSourcePreflightCoverage";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ConfirmedContentOpportunity,
} from "../../../../core/content";

function opportunity(input: Readonly<{
  topic: string;
  secondaryKeywords?: readonly string[];
  searchIntent?: string;
  readerProblem?: string;
  expectedCoverage?: readonly string[];
}>): ConfirmedContentOpportunity {
  const candidate = createContentOpportunityCandidate({
    sourceRequest: `${input.topic} 글을 작성해줘`,
    selectionMode: "userSpecified",
    selectedTopic: input.topic,
    primaryKeyword: input.topic,
    secondaryKeywords: input.secondaryKeywords ?? [],
    searchIntent: input.searchIntent
      ?? "독자가 현재 주제의 차이와 선택 기준을 이해한다.",
    audience: "일반 독자",
    contentType: "article",
    contentAngle: "선택 기준 중심",
    readerProblem: input.readerProblem
      ?? "무엇을 선택해야 할지 판단하기 어렵다.",
    expectedCoverage: input.expectedCoverage ?? [],
    selectionRationale: "사용자 지정 주제",
    opportunityEvidence: [{
      source: "unknown",
      summary: "확정 Planning",
    }],
    confidence: 0.8,
    cautions: [],
    projectId: "project-claim-scope",
  });
  return confirmContentOpportunity(candidate, {
    workspaceId: "workspace-claim-scope",
    projectId: "project-claim-scope",
    contentId: "content-claim-scope",
    confirmedAt: "2026-08-05T00:00:00.000Z",
  });
}

describe("Approval Source Preflight Claim scope", () => {
  it("removes Claims activated by an internal-link reference and conceptual rate wording", () => {
    const planning = opportunity({
      topic: "예금과 적금 차이 비교 및 선택 기준",
      secondaryKeywords: ["예금 적금 금리 계산"],
      searchIntent: "목돈이 있거나 매달 저축할 돈이 있는 독자가 자금 목적과 납입 방식에 맞는 상품 유형을 선택한다.",
      readerProblem: "독자는 금리 숫자만 비교하다가 실제 선택 기준을 놓치기 쉽다.",
      expectedCoverage: [
        "예금과 적금의 납입 구조 차이",
        "금리 숫자를 볼 때 납입 방식과 기간을 함께 봐야 하는 이유",
        "예금자보호 확인 콘텐츠와 연결되는 금융회사별 예금 합산 점검 필요성",
      ],
    });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(derived.map((claim) => claim.field)).toContain(
      "depositProtectionLimit",
    );
    expect(derived.map((claim) => claim.field)).toContain("interestRate");
    expect(scopeApprovalSourcePreflightRequirements(planning, derived)).toEqual([]);
  });

  it("keeps the specialized bundle when deposit protection is the primary topic", () => {
    const requirements = [
      { field: "depositProtectedProducts" },
      { field: "depositProtectionLimit" },
      { field: "depositProtectionUnit" },
    ];
    const result = scopeApprovalSourcePreflightRequirements(
      opportunity({ topic: "예금자보호 대상과 보호 한도 확인" }),
      requirements,
    );

    expect(result).toEqual(requirements);
  });

  it("keeps generic scalar Claims only when Planning contains a concrete value", () => {
    const result = scopeApprovalSourcePreflightRequirements(
      opportunity({ topic: "예금과 적금 차이 비교 및 선택 기준" }),
      [
        { field: "amount" },
        { field: "interestRate" },
        { field: "exceptions" },
        { field: "amount", plannedValue: "가입 한도 50만원" },
        { field: "interestRate", plannedValue: "연 3.5%" },
      ],
    );

    expect(result).toEqual([
      { field: "amount", plannedValue: "가입 한도 50만원" },
      { field: "interestRate", plannedValue: "연 3.5%" },
    ]);
  });
});
