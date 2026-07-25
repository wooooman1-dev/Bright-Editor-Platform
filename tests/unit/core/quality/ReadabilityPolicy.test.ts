import { describe, expect, it } from "vitest";

import { ContentNormalizer, type ContentDocument } from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

describe("readability paragraph policy", () => {
  it("does not penalize or split a coherent paragraph only because it contains more than six sentences", () => {
    const longParagraph = [
      "수면무호흡증 증상은 코골이만으로 판단하지 않습니다.",
      "잠자는 동안 숨이 멈추는 모습이 반복되는지 확인합니다.",
      "아침 두통이나 입 마름이 함께 있는지도 살핍니다.",
      "낮 동안 졸림이 심해지는지도 기록합니다.",
      "가족이 관찰한 호흡 변화를 메모하면 상담 내용을 구체적으로 전달할 수 있습니다.",
      "한 번의 관찰만으로 자가진단하지 않습니다.",
      "증상이 반복되면 기록을 정리해 의료진과 검사 필요성을 상의합니다.",
    ].join(" ");
    const document: ContentDocument = {
      id: "readability",
      title: "수면무호흡증 증상 확인과 검사 상담 기준",
      blocks: [
        { id: "intro", type: "paragraph", text: longParagraph },
        { id: "heading", type: "heading", level: 2, text: "관찰 결과를 정리하는 방법" },
        { id: "body", type: "paragraph", text: "관찰 시각과 증상을 같은 형식으로 기록합니다. 반복되는 양상을 확인한 뒤 상담할 내용을 정리합니다." },
        { id: "conclusion", type: "paragraph", text: "핵심은 문장 개수가 아니라 한 문단이 하나의 논점을 분명하게 설명하는지입니다. 기록한 증상이 반복되면 검사 필요성을 전문가와 상의합니다." },
      ],
    };

    const normalized = new ContentNormalizer().normalize(document);
    const readability = new QualityEngine().review(normalized, {
      platform: "tistory",
      primaryKeyword: "수면무호흡증 증상",
      searchIntent: "수면무호흡증 의심 증상과 검사 필요성 확인",
    }).dimensions.find((item) => item.category === "readability");

    expect(normalized.blocks.filter((block) => block.type === "paragraph")).toHaveLength(3);
    expect(normalized.blocks.find((block) => block.id === "intro")).toMatchObject({ text: longParagraph });
    expect(readability?.score).toBe(100);
    expect(readability?.reasons).not.toContain("한 문단에 너무 많은 문장이 이어져 읽기 어렵습니다.");
    expect(readability?.evidence.map((item) => item.signal)).not.toContain("excessiveSentenceParagraphs");
  });
});
