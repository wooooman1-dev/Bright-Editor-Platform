import { describe, expect, it } from "vitest";

import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";

const input = {
  contentType: "article" as never,
  keywords: ["건강 정보"],
  platform: "tistory" as never,
  projectId: "project-1",
};

describe("EditorialGenerationStrategy", () => {
  it("enforces the complete long-form generation contract without a maximum length", () => {
    const request = new EditorialGenerationStrategy().createRequest(input);

    expect(request.instruction).toContain("at least 4,800 non-whitespace Korean characters");
    expect(request.instruction).toContain("there is no maximum character limit");
    expect(request.instruction).toContain("build the H2 structure from the topic and confirmed search intent");
    expect(request.instruction).toContain("only when they are useful for that section");
    expect(request.instruction).toContain("Keyword placement is a mandatory completion contract");
    expect(request.instruction).toContain("every confirmed secondary keyword naturally");
    expect(request.instruction).toContain("Reader usefulness is also a mandatory completion condition");
    expect(request.instruction).toContain("Every H2 must directly fulfill its own heading and editorial purpose");
    expect(request.instruction).toContain("must not pad length by paraphrasing the same idea");
    expect(request.instruction).toContain("what concrete criterion or check can the reader use");
    expect(request.instruction).toContain("Safety and evidence integrity are mandatory completion conditions");
    expect(request.instruction).toContain("Never invent or imply a study, survey, statistic, percentage");
    expect(request.instruction).toContain("Never write first-person experience");
    expect(request.instruction).toContain("If even one remains, the article is incomplete and must not be returned");
    expect(request.instruction).toContain("avoid keyword lists, awkward repetition, or stuffing");
    expect(request.instruction).toContain("5–10 concise Tistory post tags");
    expect(request.instruction).toContain("must not be inserted into the visible article body");
  });

  it("rejects a long-form first generation below 4,800 non-whitespace prose characters", () => {
    const response = createLongFormResponse(4_799);

    expect(() => new EditorialGenerationStrategy().parse(response, input)).toThrow(
      "long-form generation requires at least 4800",
    );
  });

  it("accepts a complete long-form first generation at the 4,800-character boundary", () => {
    const response = createLongFormResponse(4_800);

    const document = new EditorialGenerationStrategy().parse(response, input);

    const proseLength = document.blocks
      .filter((block) => block.type === "paragraph")
      .reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
    expect(proseLength).toBe(4_800);
  });
});

function createLongFormResponse(proseCharacters: number): string {
  const sectionLengths = [
    Math.floor(proseCharacters / 5),
    Math.floor(proseCharacters / 5),
    Math.floor(proseCharacters / 5),
    Math.floor(proseCharacters / 5),
  ];
  sectionLengths.push(proseCharacters - sectionLengths.reduce((sum, length) => sum + length, 0));
  const paragraphs = sectionLengths.map((length) => "가".repeat(length));

  return JSON.stringify({
    title: "건강 정보 실천 가이드",
    metaDescription: "건강 정보를 이해하고 생활에서 적용할 때 확인해야 할 기준과 주의사항을 구체적으로 정리한 실천 가이드입니다.",
    blocks: [
      { type: "heading", level: 2, text: "핵심 기준" },
      { type: "paragraph", text: paragraphs[0] },
      { type: "paragraph", text: paragraphs[1] },
      { type: "heading", level: 2, text: "실천 순서" },
      { type: "paragraph", text: paragraphs[2] },
      { type: "paragraph", text: paragraphs[3] },
      { type: "heading", level: 2, text: "주의사항" },
      { type: "paragraph", text: paragraphs[4] },
    ],
  });
}
