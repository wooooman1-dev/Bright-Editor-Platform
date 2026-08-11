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
      ["checklist", "복용 목록에는 제품명과 성분, 복용 시각을 적습니다. 같은 성분이 여러 제품에 나뉘어 들어 있으면 총량이 달라지므로 제품별로 따로 적어야 합니다.\n- 처방받은 제품\n- 약국에서 산 제품\n- 별도로 먹는 보충 제품\n각 항목을 빠뜨리지 않으면 의료진이 검사 당시 조건을 확인할 수 있습니다. 복용 시각까지 적어 두면 검사 시점과의 간격을 함께 볼 수 있어 상담에서 다시 묻는 일이 줄어듭니다. 처방약과 일반의약품, 건강기능식품을 같은 목록에 두되 어디서 받은 것인지 표시해 두면 성분이 겹치는 지점을 찾기 쉽습니다. 중단했던 제품이 있다면 언제까지 먹었는지도 함께 적어, 최근 변화가 결과 해석에 영향을 줄 수 있는지 의료진이 판단할 수 있게 합니다. 목록은 검사 전날이 아니라 평소에 갱신해 두는 편이 정확합니다.", "건강기능식품 갑상선 검사 전, 성분표와 복용 시간을 확인하는 이유"],
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

  it("counts a canonical table as structured comparison information", () => {
    const target = targetFor(["운동 선택 비교 기준"]);
    const source: ContentDocument = {
      id: "table-document",
      title: "운동 선택",
      blocks: [
        { id: "intro", type: "paragraph", text: "운동 목적과 현재 상태를 먼저 확인하면 선택 범위를 줄일 수 있습니다. 자신의 일정도 함께 확인합니다." },
        { id: "heading", type: "heading", level: 2, text: "운동 선택 비교 기준" },
        { id: "explanation", type: "paragraph", text: "비교 기준은 목표와 가능한 시간을 함께 보는 것입니다. 표의 차이를 자신의 조건에 맞춰 해석합니다." },
        {
          id: "comparison-table",
          type: "table",
          headers: ["비교 기준", "근력운동", "유산소운동"],
          rows: [
            ["주된 목표", "힘과 기능", "지구력과 활동량"],
            ["선택 조건", "저항 운동이 가능한 경우", "지속 활동이 가능한 경우"],
          ],
        },
        { id: "conclusion", type: "paragraph", text: "자신의 목표와 가능한 조건을 확인한 뒤 한 가지부터 실행합니다. 통증이나 위험 신호가 있으면 전문가에게 확인합니다." },
      ],
      metadata: {
        buttonCount: 0,
        createdAt: "now",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "now",
        version: 1,
        videoCount: 0,
        wordCount: 1,
        qualityTarget: target,
        longFormStructure: {
          introductionBlockIds: ["intro"],
          sections: [{ headingBlockId: "heading", paragraphBlockIds: ["explanation", "comparison-table"], sectionType: "comparison" }],
          conclusionBlockIds: ["conclusion"],
        },
      },
    };

    const diagnostic = analyzeLongFormDocument(source, target);

    expect(diagnostic.sections[0]).toMatchObject({ tableCount: 1, completeness: "sufficient" });
    expect(diagnostic.requiredContentElements[0]?.status).toBe("sufficient");
    expect(diagnostic.actualTotalProseCharacters).toBeGreaterThan(0);
  });

  it("does not count an unordered checklist as an ordered steps sequence", () => {
    const target = targetFor(["실행 순서"]);
    const diagnostic = analyzeLongFormDocument(document(target, [[
      "steps",
      "실행 전에 조건을 확인하고 필요한 도구를 준비합니다.\n- 현재 상태 확인\n- 필요한 자료 준비\n- 결과 기록\n- 예외 조건 메모",
      "실행 순서",
    ]]), target);

    expect(diagnostic.sections[0]).toMatchObject({ sectionType: "steps", completeness: "mentioned" });
    expect(diagnostic.violations).toContainEqual(expect.objectContaining({ code: "CONTENT_INCOMPLETE_SECTION" }));
  });
});

describe("LongFormDiagnostics section role authority", () => {
  const comparisonProse = [
    "전세 보증금은 계약 종료 시 돌려받는 금액이고 월세 보증금은 그보다 적게 설정됩니다.",
    "전세는 목돈이 묶이는 반면 월세는 매달 주거비가 나갑니다.",
    "본인의 자금 사정과 거주 예정 기간을 확인한 뒤 결정합니다.",
    "계약 전에 등기부등본으로 권리관계를 확인합니다.",
  ].join(" ");

  it("does not force a table on a section whose role was only guessed from its heading", () => {
    const target = targetFor(["판단 기준"]);
    const diagnostic = analyzeLongFormDocument(
      documentWithoutStructure(target, [["전세와 월세의 차이", comparisonProse]]),
      target,
    );

    expect(diagnostic.sections[0]).toMatchObject({ sectionType: "comparison", completeness: "sufficient" });
    expect(diagnostic.violations).not.toContainEqual(expect.objectContaining({ code: "CONTENT_INCOMPLETE_SECTION" }));
  });

  it("still holds a declared comparison to its structural promise", () => {
    const target = targetFor(["판단 기준"]);
    const thin = "전세와 월세는 서로 조건이 다릅니다. 계약 전에 확인할 항목을 정리합니다. 자금 사정을 먼저 점검합니다. 거주 기간을 함께 고려합니다.";
    const diagnostic = analyzeLongFormDocument(
      document(target, [["comparison", thin, "전세와 월세의 차이"]]),
      target,
    );

    expect(diagnostic.sections[0]?.completeness).toBe("mentioned");
    expect(diagnostic.violations).toContainEqual(expect.objectContaining({ code: "CONTENT_INCOMPLETE_SECTION" }));
  });

  /**
   * 기준, 선택 and 적합 appear throughout ordinary life-economy prose, so counting
   * them let a declared comparison pass while comparing nothing.
   */
  it("does not accept a comparison that only names criteria and choices", () => {
    const target = targetFor(["판단 기준"]);
    const named = [
      "판단 기준을 먼저 정리합니다.",
      "자신의 상황에 적합한 선택을 확인합니다.",
      "선택 기준은 자금 사정과 거주 기간입니다.",
      "적합 여부는 계약 조건으로 확인합니다.",
      "기준에 따라 선택을 정리합니다.",
    ].join(" ");
    const diagnostic = analyzeLongFormDocument(
      document(target, [["comparison", named, "전세와 월세 선택 기준"]]),
      target,
    );

    expect(diagnostic.sections[0]?.completeness).toBe("mentioned");
    expect(diagnostic.violations).toContainEqual(expect.objectContaining({ code: "CONTENT_INCOMPLETE_SECTION" }));
  });
});

describe("LongFormDiagnostics table weighting", () => {
  function markdownTable(dataRows: number): string {
    return [
      "| 구분 | 조건 |",
      "| --- | --- |",
      ...Array.from({ length: dataRows }, (_, index) => `| 항목 ${index + 1} | 조건 ${index + 1} |`),
    ].join("\n");
  }

  function tableSectionDiagnostic(dataRows: number) {
    const target = targetFor(["판단 기준"]);
    return analyzeLongFormDocument(
      document(target, [["explanation", markdownTable(dataRows)]]),
      target,
    ).sections[0];
  }

  it("scores a table by its data rows rather than a flat three", () => {
    expect([1, 2, 3, 5, 6, 14].map((rows) => tableSectionDiagnostic(rows)?.informationElementCount))
      .toEqual([2, 2, 3, 5, 6, 6]);
  });

  it("stops a one-row table from completing a section by itself", () => {
    expect(tableSectionDiagnostic(1)?.completeness).toBe("mentioned");
  });

  it("keeps a table with enough rows sufficient for its section", () => {
    expect(tableSectionDiagnostic(4)?.completeness).toBe("sufficient");
  });

  /**
   * A four-row table is worth four information elements and a section needs two
   * to four, so a table plus two sentences cleared the completeness gate and
   * left nothing to read. Measured on a real article, the two sections carrying
   * a table had 313 and 208 characters of prose.
   */
  const thinProse = "이 표는 확인할 항목을 정리한 것입니다. 각 항목은 따로 기록합니다.";
  const fullProse = "이 표는 수급자격을 가늠할 때 확인할 항목을 정리한 것입니다. ".repeat(20);

  it("rejects a section that leans on a table with almost no prose", () => {
    const target = targetFor(["판단 기준"]);
    const diagnostic = analyzeLongFormDocument(
      document(target, [["comparison", `${thinProse}\n${markdownTable(4)}`]]),
      target,
    );

    expect(diagnostic.violations).toContainEqual(expect.objectContaining({
      code: "CONTENT_SECTION_PROSE_INSUFFICIENT",
    }));
  });

  it("accepts the same table once the section explains it", () => {
    const target = targetFor(["판단 기준"]);
    const diagnostic = analyzeLongFormDocument(
      document(target, [["comparison", `${fullProse}\n${markdownTable(4)}`]]),
      target,
    );

    expect(diagnostic.violations.map((item) => item.code))
      .not.toContain("CONTENT_SECTION_PROSE_INSUFFICIENT");
  });

  it("leaves a section alone when it carries no table or list", () => {
    const target = targetFor(["판단 기준"]);
    const diagnostic = analyzeLongFormDocument(
      document(target, [["explanation", thinProse]]),
      target,
    );

    expect(diagnostic.violations.map((item) => item.code))
      .not.toContain("CONTENT_SECTION_PROSE_INSUFFICIENT");
  });

  /**
   * A checklist is meant to be a list, so it is held to a lower prose floor
   * rather than exempted. Exempting it outright left the same hole in another
   * shape: a list of items with nothing explaining why they matter.
   */
  it("holds a checklist to a lower prose floor rather than exempting it", () => {
    const target = targetFor(["판단 기준"]);
    const items = "\n- 첫 번째 점검 항목\n- 두 번째 점검 항목\n- 세 번째 점검 항목";
    const bare = analyzeLongFormDocument(document(target, [["checklist", `${thinProse}${items}`]]), target);
    const explained = analyzeLongFormDocument(document(target, [["checklist", `${fullProse}${items}`]]), target);

    expect(bare.violations).toContainEqual(expect.objectContaining({
      code: "CONTENT_SECTION_PROSE_INSUFFICIENT",
      minimum: 250,
    }));
    expect(explained.violations.map((item) => item.code))
      .not.toContain("CONTENT_SECTION_PROSE_INSUFFICIENT");
  });

  it("makes a repair that empties a table visible as an information loss", () => {
    const target = targetFor(["판단 기준"]);
    const before = analyzeLongFormDocument(document(target, [["explanation", markdownTable(10)]]), target);
    const after = analyzeLongFormDocument(document(target, [["explanation", markdownTable(1)]]), target);

    expect(before.sections[0]?.informationElementCount)
      .toBeGreaterThan(after.sections[0]!.informationElementCount);
  });
});

function documentWithoutStructure(
  target: ContentPlanQualityTarget,
  values: readonly (readonly [string, string])[],
): ContentDocument {
  const source = document(target, values.map(([heading, text]) => ["explanation", text, heading] as const));
  const metadata = { ...source.metadata! };
  Reflect.deleteProperty(metadata as Record<string, unknown>, "longFormStructure");
  return { ...source, metadata } as ContentDocument;
}

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
