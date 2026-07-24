import { describe, expect, it } from "vitest";

import {
  analyzeLongFormDocument,
  assertLongFormDocument,
  determineContentPlanQualityTarget,
  LongFormValidationError,
  type ContentDocument,
  type ContentPlanQualityTarget,
  type ContentSectionType,
} from "../../../../core/content";

describe("LongFormDiagnostics information sufficiency", () => {
  it("allows a concise standard article when required information is sufficient", () => {
    const target = targetFor(["판단 기준", "주의사항"]);
    const diagnostic = analyzeLongFormDocument(document(target, [
      ["explanation", "판단 기준은 상황을 구분하는 조건입니다. 먼저 현재 상태를 확인합니다. 조건에 따라 실행 방법을 선택합니다."],
      ["warning", "주의사항은 예외를 확인하는 것입니다. 위험 신호가 있으면 임의로 진행하지 않습니다. 필요한 경우 전문가에게 확인한 뒤 다음 행동을 정합니다."],
    ]), target);
    expect(diagnostic.violations).toEqual([]);
    expect(diagnostic.requiredContentElements.every((item) => item.status === "sufficient")).toBe(true);
    expect(diagnostic).not.toHaveProperty("targetLengthRange");
    expect(diagnostic.warningCodes).not.toContain("CONTENT_BELOW_PLANNING_TARGET");
  });

  it("distinguishes a formal mention from sufficient explanation", () => {
    const target = targetFor(["주의사항"]);
    const diagnostic = analyzeLongFormDocument(document(target, [
      ["warning", "주의사항."],
    ]), target);
    expect(diagnostic.requiredContentElements[0]?.status).toBe("mentioned");
    expect(diagnostic.violations).toContainEqual(expect.objectContaining({ code: "CONTENT_REQUIRED_ELEMENT_INSUFFICIENT" }));
  });

  it("rejects long prose when required information is missing", () => {
    const target = targetFor(["보험 청구 서류"]);
    const filler = "배경을 여러 표현으로 자세히 설명하지만 독자가 필요한 핵심 정보와는 관련이 없습니다. ".repeat(80);
    const diagnostic = analyzeLongFormDocument(document(target, [["explanation", filler]]), target);
    expect(diagnostic.actualTotalProseCharacters).toBeGreaterThan(1_000);
    expect(diagnostic.violations).toContainEqual(expect.objectContaining({ code: "CONTENT_REQUIRED_ELEMENT_MISSING" }));
    expect(() => assertLongFormDocument(document(target, [["explanation", filler]]), target)).toThrow(LongFormValidationError);
  });

  it("rejects duplicated padding independently of prose length", () => {
    const target = targetFor(["판단 기준"]);
    const duplicate = "판단 기준은 현재 조건을 확인하고 다음 행동을 선택하는 데 사용합니다.";
    const source = document(target, [
      ["explanation", `${duplicate} ${duplicate}`],
      ["case_example", `${duplicate} ${duplicate}`],
    ]);
    expect(analyzeLongFormDocument(source, target).violations).toContainEqual(expect.objectContaining({ code: "CONTENT_REPETITION_DETECTED" }));
  });

  it("matches a concrete required element to its owning H2 and evaluates the section body for sufficiency", () => {
    const requirements = [
      "TSH와 유리 T4가 개인 상태와 검사 맥락 속에서 해석되어야 하는 이유",
      "처방약·일반의약품·건강기능식품을 빠짐없이 알리는 중요성",
      "결과가 예상과 다르게 보일 때 진료 시 제시할 정보",
    ];
    const target = targetFor(requirements);
    const diagnostic = analyzeLongFormDocument(document(target, [
      ["explanation", "검사 수치는 당시 몸 상태와 검사 조건의 영향을 함께 살펴야 합니다. 한 항목만 떼어 보면 변화의 원인을 구분하기 어렵습니다. 이전 결과와 현재 증상을 함께 비교하면 상담 질문을 구체화할 수 있습니다.", "TSH와 유리 T4는 왜 검사 맥락과 함께 해석해야 할까"],
      ["checklist", "복용 목록에는 제품명과 성분, 복용 시각을 적습니다.\n- 처방받은 제품\n- 약국에서 산 제품\n- 별도로 먹는 보충 제품\n각 항목을 빠뜨리지 않으면 의료진이 검사 당시 조건을 확인할 수 있습니다.", "건강기능식품 갑상선 검사 전, 성분표와 복용 시간을 확인하는 이유"],
      ["warning", "예상과 다른 표시가 있어도 스스로 진단하거나 복용을 바꾸지 않습니다. 최근 몸 상태와 복용 기록을 준비해 상담합니다. 의료진이 추가 평가나 재검 여부를 판단할 수 있도록 이전 결과도 함께 제시합니다.", "결과가 예상과 다를 때: 재검 상담 전에 정리할 정보와 피해야 할 행동"],
    ]), target);

    expect(diagnostic.requiredContentElements).toEqual(requirements.map((element) => ({
      element,
      status: "sufficient",
      satisfied: true,
    })));
    expect(diagnostic.violations).toEqual([]);
  });

  it("does not treat a matching H2 as sufficient when its body is only a formal mention", () => {
    const target = targetFor(["결과가 예상과 다르게 보일 때 진료 시 제시할 정보"]);
    const diagnostic = analyzeLongFormDocument(document(target, [
      ["warning", "확인하세요.", "결과가 예상과 다를 때 진료 시 제시할 정보"],
    ]), target);

    expect(diagnostic.requiredContentElements[0]?.status).toBe("mentioned");
  });
});

function targetFor(requiredContentElements: readonly string[]): ContentPlanQualityTarget {
  return determineContentPlanQualityTarget({
    contentType: "article",
    readerProblem: "독자가 안전하게 판단하고 행동하는 방법",
    requiredContentElements,
  });
}

function document(target: ContentPlanQualityTarget, values: readonly (readonly [ContentSectionType, string, string?])[]): ContentDocument {
  const blocks: ContentDocument["blocks"][number][] = [
    { id: "intro", type: "paragraph", text: "이 글은 독자가 자신의 상황을 판단하고 안전한 다음 행동을 선택하도록 돕습니다. 핵심 조건부터 직접 확인합니다." },
  ];
  const sections = values.map(([sectionType, text, heading], index) => {
    const headingBlockId = `h-${index}`;
    const paragraphBlockIds = [`p-${index}`];
    blocks.push({ id: headingBlockId, type: "heading", level: 2, text: heading ?? `섹션 ${index + 1}` });
    blocks.push({ id: paragraphBlockIds[0], type: "paragraph", text });
    return { headingBlockId, paragraphBlockIds, sectionType };
  });
  blocks.push({ id: "conclusion", type: "paragraph", text: "조건을 다시 확인하고 자신의 상황에 맞는 다음 행동을 실행합니다. 위험 신호가 있으면 전문가에게 확인합니다." });
  return {
    id: "document",
    title: "정보 충분성 진단 문서",
    blocks,
    metadata: {
      buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1,
      source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1, qualityTarget: target,
      longFormStructure: { introductionBlockIds: ["intro"], sections, conclusionBlockIds: ["conclusion"] },
    },
  };
}
