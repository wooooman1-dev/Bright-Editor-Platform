import { describe, expect, it } from "vitest";

import {
  analyzeContentOpportunityAlignment,
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ContentDocument,
} from "../../../../core/content";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "생활비와 소득 안정성을 반영한 비상금 목표액 설정",
  selectionMode: "automatic",
  selectedTopic: "비상금 규모 설정 방법: 생활비·고정지출·소득 안정성으로 목표액 정하기",
  primaryKeyword: "비상금 규모 설정 방법",
  secondaryKeywords: ["생활비 비상금", "비상금 목표액", "비상금 통장 관리"],
  searchIntent: "독자가 자신의 생활 조건에 맞춰 비상금 목표액을 정하고 관리 우선순위를 결정하려는 검색",
  audience: "생활비와 저축의 우선순위를 정하려는 독자",
  contentType: "guide",
  contentAngle: "개인 상황에 맞춘 비상금 목표액 설계",
  readerProblem: "얼마를 마련해야 하는지와 어떤 돈을 비상금으로 구분해야 하는지 판단하기 어렵다.",
  expectedCoverage: [
    "비상금으로 대비하려는 상황과 일반 저축 목표를 구분하는 관찰 기준",
    "필수생활비·고정지출·변동지출을 나누어 최소 유지비를 산정하는 방법",
    "소득의 규칙성, 부양 책임, 부채 상환 부담, 가까운 예정 지출을 반영하는 목표액 조정 기준",
    "한 번에 목표액을 만들기 어려울 때 우선 확보 구간을 나누는 방법",
    "비상금과 목적자금·투자자금·월 생활비 계좌를 구분해 관리하는 원칙",
    "목표액을 정한 뒤 월별 적립 계획과 재점검 시점을 만드는 방법",
  ],
  selectionRationale: "독자가 실행할 수 있는 생활경제 계획을 제공한다.",
  opportunityEvidence: [{ source: "unknown", summary: "project content gap" }],
  confidence: 0.8,
  cautions: [],
  projectId: "project-1",
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });

describe("Content Opportunity heading coverage", () => {
  it("accepts distinct topical headings when their sections fulfill the confirmed planning scopes", () => {
    const alignment = analyzeContentOpportunityAlignment(article([
      ["비상금은 어떤 지출을 대비하는 돈인가", "예고 없는 소득 공백과 긴급 생활 지출은 비상금으로 대비합니다. 여행비처럼 날짜와 목적을 아는 지출은 일반 저축 목표인 목적자금으로 분리해야 기준이 흐려지지 않습니다."],
      ["생활비 비상금의 최소 유지비 계산하기", "필수생활비, 고정지출, 변동지출을 최근 지출 내역에서 나눕니다. 주거비와 상환액처럼 미룰 수 없는 비용을 더해 최소 유지비를 산정합니다."],
      ["비상금 목표액을 조정하는 개인 상황 진단표", "소득의 규칙성, 부양 책임, 부채 상환 부담, 가까운 예정 지출을 함께 점검합니다. 불안정성이 클수록 목표액 범위를 넓혀 조정합니다."],
      ["최소 목표와 확장 목표로 비상금 목표액 나누기", "한 번에 목표액을 만들기 어렵다면 먼저 확보할 최소 구간을 정합니다. 이후 소득 공백에 대비할 확장 구간을 추가해 단계적으로 마련합니다."],
      ["비상금 통장 관리와 목적자금 분리", "비상금, 목적자금, 투자자금, 월 생활비 계좌의 역할을 구분합니다. 목적이 다른 돈을 섞지 않아야 실제 비상 대응 여력을 확인할 수 있습니다."],
      ["목표액을 적립 계획으로 바꾸는 실행 양식", "목표액을 정한 뒤 월별 적립 금액과 다음 재점검 시점을 기록합니다. 소득이나 주거비가 바뀌면 같은 기준으로 계획을 다시 계산합니다."],
    ]), opportunity);

    expect(alignment.review.headingCoverage.pass).toBe(true);
    expect(alignment.review.headingCoverage.score).toBe(100);
    expect(alignment.review.headingCoverage.evidence).toContain("계획 범위의 H2/H3 섹션 연결: 6/6");
  });

  /**
   * 제목이 주제어를 담았는지는 더 이상 재지 않는다. 시스템이 본문 끝에 붙이는
   * `출처` 제목이 두 글자라 어떤 주제어도 담을 수 없어, 승인용 원고가 통과할
   * 방법이 없는 검사였다. 남은 질문은 계획한 범위가 섹션으로 다뤄졌는가 하나다.
   */
  it("judges generic headings by the scopes their sections cover, not by their wording", () => {
    const alignment = analyzeContentOpportunityAlignment(article([
      ["먼저 알아둘 점", "비상금 목표액을 정할 때 생활비, 고정지출, 소득 안정성을 모두 고려해야 합니다. 비상금 규모 설정 방법은 개인 상황에 따라 달라집니다."],
      ["다음으로 확인할 점", "생활비 비상금과 목적자금을 구분하고 월별 적립 계획을 세워야 합니다. 비상금 통장 관리를 재점검하는 일도 중요합니다."],
    ]), opportunity);

    expect(alignment.review.headingCoverage.pass).toBe(true);
    expect(alignment.review.headingCoverage.evidence).toContain("계획 범위의 H2/H3 섹션 연결: 4/6");
    expect(alignment.review.headingCoverage.evidence.some((item) => item.includes("앵커"))).toBe(false);
    expect(alignment.review.headingCoverage.blockingReason).toBeUndefined();
  });

  it("does not count introduction coverage as a substitute for a scoped H2/H3 section", () => {
    const document: ContentDocument = {
      id: "content-1",
      title: "비상금 규모 설정 방법: 생활비·고정지출로 내 목표액 정하기",
      blocks: [
        { id: "intro", text: "비상금, 생활비, 고정지출, 소득 안정성, 목적자금, 월별 적립과 재점검을 모두 소개하지만 아직 목차별로 설명하지는 않습니다.", type: "paragraph" },
        { id: "heading", level: 2, text: "비상금 계획의 출발점", type: "heading" },
        { id: "body", text: "다음 섹션에서 개인 상황에 맞춘 판단 과정을 자세히 설명합니다.", type: "paragraph" },
      ],
    };

    const alignment = analyzeContentOpportunityAlignment(document, opportunity);

    expect(alignment.review.headingCoverage.pass).toBe(false);
    expect(alignment.review.headingCoverage.evidence.find((item) => item.startsWith("계획 범위의 H2/H3 섹션 연결:")))
      .toMatch(/: [0-5]\/6$/);
  });
});

function article(sections: readonly (readonly [string, string])[]): ContentDocument {
  return {
    id: "content-1",
    title: "비상금 규모 설정 방법: 생활비·고정지출로 내 목표액 정하기",
    blocks: sections.flatMap(([heading, text], index) => [
      { id: `heading-${index + 1}`, level: 2 as const, text: heading, type: "heading" as const },
      { id: `paragraph-${index + 1}`, text, type: "paragraph" as const },
    ]),
  };
}
