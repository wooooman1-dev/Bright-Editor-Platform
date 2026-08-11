import { describe, expect, it } from "vitest";

import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import { confirmContentOpportunity, createContentOpportunityCandidate } from "../../../../core/content";

describe("EditorialGenerationStrategy information sufficiency target", () => {
  it("normalizes a simple checklist to standard without any character target", () => {
    const request = new EditorialGenerationStrategy().createRequest(input("quick"));
    expect(request.instruction).toContain("contentDepth is standard");
    expect(request.instruction).toContain("Required content elements");
    expect(request.instruction).toContain("Decision criteria");
    expect(request.instruction).toContain("Reader problem");
    expect(request.instruction).toContain("same response-writing process");
    expect(request.instruction).toContain("never reach it by padding");
    expect(request.instruction).toContain("coverage map");
    expect(request.instruction).toContain("exactly one primary H2");
    expect(request.instruction).toContain("do not repeat the same caution or next action in every H2");
    expect(request.instruction).toContain("Choose the representation by information type");
    expect(request.instruction).toContain("a table is reserved for genuine multi-column comparison or lookup");
    expect(request.instruction).toContain("sectionType is semantic presentation intent, not a quota");
    expect(request.instruction).not.toMatch(/\b(?:2000|3500|5500|5,500)\b/);
  });

  it("uses the deep health target and section roles", () => {
    const request = new EditorialGenerationStrategy().createRequest(input("deep"));
    expect(request.instruction).toContain("contentDepth is deep");
    expect(request.instruction).toContain("Decision criteria");
    expect(request.instruction).toContain("Warnings or exceptions");
    expect(request.instruction).toContain("sectionType");
    expect(request.instruction).toContain("판단 기준");
    expect(request.instruction).toContain("never invent an unverified number");
  });

  it("does not reintroduce a legacy length target through the Opportunity snapshot", () => {
    const generationInput = input("deep");
    const opportunity = generationInput.contentOpportunity!;
    const legacyOpportunity = {
      ...opportunity,
      qualityTarget: {
        ...opportunity.qualityTarget,
        targetLengthRange: { min: 6000, preferred: 7000, max: 8000 },
        sectionLengthGuidance: "각 섹션 450자 이상",
      },
    };
    const request = new EditorialGenerationStrategy().createRequest({
      ...generationInput,
      contentOpportunity: legacyOpportunity as unknown as NonNullable<typeof generationInput.contentOpportunity>,
      editorialContext: JSON.stringify({ projectStrategy: { targetLength: "4,500~6,000자" } }),
    });

    expect(request.instruction).not.toContain("targetLength");
    expect(request.instruction).not.toContain("4,500~6,000자");
    expect(request.instruction).not.toContain("6000");
    expect(request.instruction).not.toContain("450자");
  });

  it("accepts a concise complete standard checklist without a global length floor", () => {
    const document = new EditorialGenerationStrategy().parse(response("quick"), input("quick"));
    expect(document.metadata?.qualityTarget?.contentDepth).toBe("standard");
    expect(document.metadata?.generationDiagnostic?.actualSectionCount).toBe(3);
    expect(document.metadata?.generationDiagnostic?.violations).toEqual([]);
    expect(document.metadata?.longFormStructure?.sections[0]?.sectionType).toBe("checklist");
    expect(document.metadata?.longFormStructure?.sections[1]?.sectionType).toBe("steps");
    expect(document.metadata?.generationDiagnostic).not.toHaveProperty("targetLengthRange");
  });

  it("reconciles an unsupported generated steps label to the structure actually present", () => {
    const generated = JSON.parse(response("quick")) as Generated;
    generated.sections[1] = section(
      "1단계: 최근 사용 내역 기록하기",
      "steps",
      "먼저 최근 사용 내역을 한곳에 기록합니다. 서로 다른 달을 같은 기준으로 맞추면 변화가 보입니다. 표를 채운 뒤 특이한 달의 이유를 메모합니다.\n\n| 구분 | 1개월 전 | 최근 1개월 |\n|---|---|---|\n| 사용량 | 직접 기록 | 직접 기록 |\n| 납부액 | 직접 기록 | 직접 기록 |",
    );

    const document = new EditorialGenerationStrategy().parse(JSON.stringify(generated), input("quick"));

    expect(document.metadata?.longFormStructure?.sections[1]?.sectionType).toBe("comparison");
    expect(document.metadata?.generationDiagnostic?.violations).not.toContainEqual(expect.objectContaining({
      code: "CONTENT_INCOMPLETE_SECTION",
      heading: "1단계: 최근 사용 내역 기록하기",
    }));
  });

  it("does not hide a genuinely shallow steps section through semantic reconciliation", () => {
    const generated = JSON.parse(response("quick")) as Generated;
    generated.sections[1] = section("실행 순서", "steps", "기록합니다.");

    const document = new EditorialGenerationStrategy().parse(JSON.stringify(generated), input("quick"));

    expect(document.metadata?.longFormStructure?.sections[1]?.sectionType).toBe("steps");
    expect(document.metadata?.generationDiagnostic?.violations).toContainEqual(expect.objectContaining({
      code: "CONTENT_INCOMPLETE_SECTION",
      heading: "실행 순서",
    }));
  });

  it("preserves a shallow deep draft with diagnostics for editor correction", () => {
    const strategy = new EditorialGenerationStrategy();
    const valid = strategy.parse(response("deep"), input("deep"));
    expect(valid.metadata?.generationDiagnostic?.violations).toEqual([]);
    const shallow = JSON.parse(response("deep")) as Generated;
    shallow.sections[1].paragraphs = ["원인."];
    const document = strategy.parse(JSON.stringify(shallow), input("deep"));
    expect(document.metadata?.generationDiagnostic?.violations).toContainEqual(expect.objectContaining({
      code: "CONTENT_INCOMPLETE_SECTION",
    }));
  });

  it("preserves a repeated deep draft with diagnostics even when it is long", () => {
    const repeated = JSON.parse(response("deep")) as Generated;
    const duplicate = "배경과 원인을 설명합니다. 판단 기준과 조건을 구분합니다. 실제 적용 사례와 예외를 제시합니다. 주의할 위험을 확인합니다. 먼저 기록하고 다음으로 비교한 뒤 마지막으로 상담 여부를 정합니다.";
    repeated.sections.forEach((section) => { section.paragraphs = [duplicate, duplicate]; });
    const document = new EditorialGenerationStrategy().parse(JSON.stringify(repeated), input("deep"));
    expect(document.metadata?.generationDiagnostic?.violations).toContainEqual(expect.objectContaining({
      code: "CONTENT_REPETITION_DETECTED",
    }));
  });
});

type Depth = "quick" | "deep";
type Generated = {
  sections: Array<{ heading: string; sectionType: string; paragraphs: string[] }>;
  [key: string]: unknown;
};

function input(depth: Depth) {
  const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
    sourceRequest: depth === "quick" ? "노트북 청소 체크리스트" : "건강검진 결과표 심층 해석",
    selectionMode: "userSpecified",
    selectedTopic: depth === "quick" ? "노트북 청소 체크리스트" : "건강검진 결과표 심층 건강 가이드",
    primaryKeyword: depth === "quick" ? "노트북 청소" : "건강검진 결과표",
    secondaryKeywords: [],
    searchIntent: depth === "quick" ? "간단 사용법과 체크리스트" : "건강검진 결과를 깊이 이해하고 판단하는 방법",
    audience: "일반 독자",
    contentType: depth === "quick" ? "quick checklist" : "deep health guide",
    contentAngle: "실제 적용 중심",
    readerProblem: depth === "quick" ? "안전하게 노트북을 청소하는 순서가 궁금함" : "검진표 수치의 맥락과 다음 행동을 판단하기 어려움",
    expectedCoverage: [],
    selectionRationale: "사용자 요청",
    opportunityEvidence: [{ source: "unknown", summary: "사용자 요청" }],
    confidence: 1,
    cautions: [],
    projectId: "project-1",
  }), { workspaceId: "workspace-1", projectId: "project-1", contentId: `content-${depth}`, confirmedAt: "now" });
  return {
    contentId: `content-${depth}`,
    contentType: opportunity.contentType as never,
    contentOpportunity: opportunity,
    keywords: [opportunity.primaryKeyword],
    platform: "tistory" as never,
    projectId: "project-1",
    structuredLongFormOutput: true,
  };
}

function response(depth: Depth): string {
  const quick = depth === "quick";
  const sections = quick
    ? [
      section("준비 체크리스트", "checklist", "전원을 끄는 이유와 작업 안전에 미치는 영향을 확인합니다.\n- 전원을 끕니다.\n- 케이블을 분리합니다.\n- 마른 천을 준비합니다.\n- 통풍구를 확인합니다. " + sentence("가", 430)),
      section("노트북 청소 순서", "steps", "실행 방법은 안전 확인 뒤 순서대로 진행하는 것입니다.\n1. 겉면을 닦습니다.\n2. 키보드를 정리합니다.\n3. 통풍구를 확인합니다. " + sentence("나", 500)),
      section("피해야 할 행동과 주의점", "warning", "액체를 직접 뿌리면 위험합니다. 강한 압력을 피해야 합니다. 이상이 보이면 사용을 멈추고 확인합니다. " + "다".repeat(420)),
    ]
    : [
      section("건강검진 결과표의 의미와 배경", "explanation", "건강검진 결과표의 배경과 원인을 설명합니다. 수치는 생활 맥락과 함께 봐야 합니다. 검사 당시 상황도 결과에 영향을 줄 수 있어 함께 기록합니다."),
      section("결과 변화의 원인과 관찰 기준", "explanation", "변화의 원인과 관찰 기준을 기록합니다. 이전 결과와 생활 변화를 함께 확인합니다. 한 번의 값보다 변화 방향과 현재 상태를 구분합니다."),
      section("수치를 해석하는 판단 기준", "explanation", "판단 기준은 한 수치가 아니라 변화와 상태를 함께 확인하는 것입니다. 증상과 과거 결과를 나누어 살핍니다. 조건이 다르면 단순 비교를 피합니다."),
      section("실제 적용 예시와 기록 방법", "case_example", "예를 들어 검진 전후 상황을 기록합니다. 생활 변화가 있었는지 판단 기준에 적용합니다. 기록한 맥락은 상담에서 질문을 구체화하는 데 사용합니다."),
      section("주의사항과 예외 상황", "warning", "주의할 예외와 위험 징후를 구분합니다. 이상이 있으면 임의로 진단하지 않습니다. 필요한 경우 의료진에게 확인해 다음 행동을 정합니다."),
      section("다음 행동을 정하는 순서", "steps", "먼저 결과를 기록합니다. 다음으로 변화와 증상을 확인합니다. 조건에 따라 상담 필요성을 판단합니다. 마지막으로 필요한 상담을 준비합니다."),
    ];
  return JSON.stringify({
    title: quick ? "노트북 청소 체크리스트" : "건강검진 결과표 심층 해석 가이드",
    metaDescription: "독자가 필요한 판단 기준과 실제 적용 순서, 주의사항을 이해할 수 있도록 구체적으로 정리한 안내입니다.",
    primarySearchIntent: quick ? "간단 청소 방법" : "검진표 해석과 다음 행동",
    secondaryIntent: "실제 적용",
    secondaryKeywords: [],
    relatedTerms: ["판단 기준", "주의사항"],
    tags: ["가이드", "체크리스트", "판단기준", "주의사항", "실천방법"],
    introduction: [quick
      ? "노트북 청소는 전원을 끄고 도구를 준비한 뒤 순서대로 진행하면 됩니다. 독자의 질문에 바로 답하고 안전한 기준을 먼저 확인합니다. " + "서".repeat(260)
      : "건강검진 결과표는 한 번의 수치만으로 결론내리지 않고 변화, 현재 상태, 생활 맥락을 함께 확인해야 합니다. 이 글은 독자의 질문에 직접 답합니다. " + "서".repeat(360)],
    sections,
    conclusion: [quick
      ? "다음 청소 전에는 전원과 케이블을 먼저 확인하고 무리한 액체 사용을 피합니다. 이상이 있으면 다음 행동으로 점검을 선택합니다. " + "결".repeat(260)
      : "다음 행동은 결과를 기록하고 관찰한 변화와 판단 기준을 정리한 뒤 필요한 경우 의료진에게 확인하는 것입니다. 주의사항과 예외를 놓치지 않습니다. " + "결".repeat(350)],
    images: [{ afterSection: 0, purpose: "hero", alt: quick ? "노트북 청소 준비물" : "건강검진 결과표 해석", prompt: "독자가 핵심 판단 순서를 이해하는 한국어 블로그용 장면, 텍스트 없음" }],
    cta: [],
  });
}

function section(heading: string, sectionType: string, text: string) {
  return { heading, sectionType, paragraphs: [text] };
}
function sentence(character: string, length: number) {
  const chunk = character.repeat(Math.floor(length / 3));
  return `${chunk}입니다. ${chunk}입니다. ${chunk}입니다.`;
}
