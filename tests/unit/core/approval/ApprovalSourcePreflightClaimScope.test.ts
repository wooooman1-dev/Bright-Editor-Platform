import { describe, expect, it } from "vitest";

import { scopeApprovalSourcePreflightRequirements } from "../../../../core/approval/ApprovalSourcePreflightClaimScope";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ConfirmedContentOpportunity,
} from "../../../../core/content";

function opportunity(topic: string): ConfirmedContentOpportunity {
  const candidate = createContentOpportunityCandidate({
    sourceRequest: `${topic} 글을 작성해줘`,
    selectionMode: "userSpecified",
    selectedTopic: topic,
    primaryKeyword: topic,
    secondaryKeywords: [],
    searchIntent: "독자가 현재 주제의 차이와 선택 기준을 이해한다.",
    audience: "일반 독자",
    contentType: "article",
    contentAngle: "선택 기준 중심",
    readerProblem: "무엇을 선택해야 할지 판단하기 어렵다.",
    expectedCoverage: [],
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
  it("removes a specialized topic bundle that appears only outside the primary topic", () => {
    const result = scopeApprovalSourcePreflightRequirements(
      opportunity("예금과 적금 차이 비교 및 선택 기준"),
      [
        { field: "depositProtectedProducts" },
        { field: "depositProtectionLimit" },
        { field: "depositProtectionUnit" },
        { field: "depositProtectionExclusions" },
        { field: "depositProtectionCheckPath" },
        { field: "depositProtectionEffectiveDate" },
        { field: "depositProtectionStatutoryBasis" },
      ],
    );

    expect(result).toEqual([]);
  });

  it("keeps the specialized bundle when deposit protection is the primary topic", () => {
    const requirements = [
      { field: "depositProtectedProducts" },
      { field: "depositProtectionLimit" },
      { field: "depositProtectionUnit" },
    ];
    const result = scopeApprovalSourcePreflightRequirements(
      opportunity("예금자보호 대상과 보호 한도 확인"),
      requirements,
    );

    expect(result).toEqual(requirements);
  });

  it("keeps generic scalar Claims only when Planning contains a concrete value", () => {
    const result = scopeApprovalSourcePreflightRequirements(
      opportunity("예금과 적금 차이 비교 및 선택 기준"),
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
