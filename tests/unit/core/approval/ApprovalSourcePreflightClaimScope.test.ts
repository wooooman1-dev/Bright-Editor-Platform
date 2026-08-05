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

  it("does not treat insurance contract check labels as factual scalar Claims", () => {
    const planning = opportunity({
      topic: "보험료 점검 방법: 보장·갱신·해지 조건을 확인하는 순서",
      secondaryKeywords: [
        "보험 보장 내용 확인",
        "갱신형 비갱신형 차이",
        "보험 해지 전 확인사항",
      ],
      searchIntent: "보험료를 줄이거나 유지할지 판단하기 전에 보장 내용, 갱신 여부, 납입기간과 해지 영향을 확인하는 순서를 알고 싶어 한다.",
      readerProblem: "보험료가 부담될 때 계약 조건을 충분히 확인하지 않은 채 변경을 고려할 수 있다.",
      expectedCoverage: [
        "보장 금액 확인",
        "보장 기간 확인",
        "납입기간 확인",
        "갱신 여부 확인",
        "해지 영향 확인",
        "보장 대상·보장 기간·보장 금액·면책 및 제한 조건을 확인하는 순서",
      ],
    });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(derived).toContainEqual({
      field: "amount",
      plannedValue: "·면책 및 제한 조건을 확인하는 순서",
    });
    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .toEqual([]);
  });

  it.each([
    {
      field: "amount",
      topic: "지원 제도 금액 확인",
      line: "지원 금액: 50만원",
      plannedValue: "50만원",
    },
    {
      field: "interestRate",
      topic: "예금 금리 확인",
      line: "연 금리 3.5%",
      plannedValue: "3.5%",
    },
    {
      field: "period",
      topic: "지원 제도 신청 기간 확인",
      line: "신청 기간: 2026년 8월 1일부터 8월 31일까지",
      plannedValue: "2026년 8월 1일부터 8월 31일까지",
    },
  ])("keeps a concrete $field Planning fact", ({
    field,
    topic,
    line,
    plannedValue,
  }) => {
    const planning = opportunity({ topic, expectedCoverage: [line] });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .toContainEqual({ field, plannedValue });
  });

  it("does not promote amount or limit wording from related-content context", () => {
    const planning = opportunity({
      topic: "가계 고정지출 점검 순서",
      expectedCoverage: [
        "관련 콘텐츠: 지원 금액과 법정 한도를 비교하는 글",
        "내부 링크에서 금액과 한도를 확인하는 방법을 안내",
      ],
    });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(derived.map((claim) => claim.field)).toContain("amount");
    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .toEqual([]);
  });

  it("removes placeholder generic scalar values", () => {
    const cases = [
      { field: "amount", topic: "지원 금액 확인", line: "지원 금액: 확인 필요" },
      { field: "interestRate", topic: "금리 확인", line: "금리 확인" },
      { field: "eligibility", topic: "지원 대상 확인", line: "지원 대상 확인" },
      { field: "exceptions", topic: "예외 확인", line: "일반화하면 안 되는 예외와 주의사항" },
    ] as const;

    for (const item of cases) {
      const planning = opportunity({ topic: item.topic, expectedCoverage: [item.line] });
      const derived = requiredApprovalSourcePreflightClaims(
        planning,
        "wordpress_life_economy_v1",
      );

      expect(derived.map((claim) => claim.field)).toContain(item.field);
      expect(scopeApprovalSourcePreflightRequirements(planning, derived))
        .not.toContainEqual(expect.objectContaining({ field: item.field }));
    }
  });

  it("keeps a factual amount even when the same line has an editorial count", () => {
    const planning = opportunity({
      topic: "지원 제도 금액 확인",
      expectedCoverage: ["지원 금액 50만원, 확인 항목 3가지"],
    });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );
    const amount = derived.find((claim) => claim.field === "amount");

    expect(amount?.plannedValue).toContain("50만원");
    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .toContainEqual(expect.objectContaining({
        field: "amount",
        plannedValue: expect.stringContaining("50만원"),
      }));
  });

  it.each([
    {
      field: "interestRate",
      topic: "금리 확인",
      line: "금리: 3.5",
    },
    {
      field: "period",
      topic: "신청 기간 확인",
      line: "신청 기간: 2026년 기준",
    },
    {
      field: "statutoryBasis",
      topic: "법적 근거 확인",
      line: "법적 근거: 제30조",
    },
  ])("does not keep a non-factual numeric $field value", ({ field, topic, line }) => {
    const planning = opportunity({ topic, expectedCoverage: [line] });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(derived).toContainEqual(expect.objectContaining({ field }));
    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .not.toContainEqual(expect.objectContaining({ field }));
  });

  it("does not keep the unlabelled bare rate number", () => {
    const planning = opportunity({
      topic: "금리 확인",
      expectedCoverage: ["금리 3.5"],
    });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .not.toContainEqual(expect.objectContaining({ field: "interestRate" }));
  });

  it.each([
    {
      field: "period",
      topic: "신청 기간 확인",
      line: "신청 기간: 2026년 8월 1일부터 8월 31일까지",
    },
    { field: "period", topic: "신청 기간 확인", line: "신청 기간: 3개월" },
    { field: "interestRate", topic: "금리 확인", line: "연 금리 3.5%" },
    { field: "eligibility", topic: "지원 대상 확인", line: "지원 대상: 무주택 세대주" },
    { field: "exceptions", topic: "예외 확인", line: "제외 대상: 법인" },
    { field: "statutoryBasis", topic: "법적 근거 확인", line: "법적 근거: 보험업법 제30조" },
  ])("keeps a field-specific factual $field value", ({ field, topic, line }) => {
    const planning = opportunity({ topic, expectedCoverage: [line] });
    const derived = requiredApprovalSourcePreflightClaims(
      planning,
      "wordpress_life_economy_v1",
    );

    expect(scopeApprovalSourcePreflightRequirements(planning, derived))
      .toContainEqual(expect.objectContaining({ field }));
  });

  it.each([
    {
      field: "depositProtectionLimit",
      topic: "예금자보호 대상과 보호 한도 확인",
    },
    {
      field: "revolvingMinimumPaymentRatio",
      topic: "리볼빙 최소결제비율 확인",
    },
    {
      field: "continuingTransactionArticle30Threshold",
      topic: "계속거래 계약서와 법 제30조 설명",
    },
    {
      field: "retirementPayFormula",
      topic: "퇴직금 계산 공식 확인",
    },
  ])("preserves specialized $field topic scoping", ({ field, topic }) => {
    const planning = opportunity({ topic });
    const requirements = [{ field }];

    expect(scopeApprovalSourcePreflightRequirements(planning, requirements))
      .toEqual(requirements);
  });
});
