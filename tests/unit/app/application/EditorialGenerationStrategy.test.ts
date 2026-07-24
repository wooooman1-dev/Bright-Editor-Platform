import { describe, expect, it } from "vitest";

import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";

const input = {
  contentType: "article" as never,
  keywords: ["건강 정보"],
  platform: "tistory" as never,
  projectId: "project-1",
  structuredLongFormOutput: true,
};

describe("EditorialGenerationStrategy", () => {
  it("enforces the complete long-form generation contract without a maximum length", () => {
    const request = new EditorialGenerationStrategy().createRequest(input);

    expect(request.instruction).toContain("server hard floor is 4,800");
    expect(request.instruction).toContain("target 6,000–6,500");
    expect(request.instruction).toContain("at least 5,500");
    expect(request.instruction).toContain("each boundary totals about 400–500");
    expect(request.instruction).toContain("the section totals about 800–900");
    expect(request.instruction).toContain("Every section must contain exactly eight developed paragraphs");
    expect(request.instruction).toContain("Write six developed H2 sections by default");
    expect(request.instruction).toContain("With six H2 sections, each section paragraph should contain about 100–112");
    expect(request.instruction).toContain("With five H2 sections, each section paragraph should contain about 115–125");
    expect(request.instruction).toContain("absolute minimum of 450");
    expect(request.instruction).toContain("internally measure every paragraph, every section");
    expect(request.instruction).toContain("Repeated core advice is zero");
    expect(request.instruction).toContain("at least three useful observable criteria");
    expect(request.instruction).toContain("Consolidate repeated advice into the single section where it belongs");
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

  it("rejects a first generation below the 4,800 hard floor", () => {
    const response = createLongFormResponse(4_799, 5);
    expect(() => new EditorialGenerationStrategy().parse(response, input))
      .toThrow("LONG_FORM_TOTAL_BELOW_HARD_FLOOR");
  });

  it("accepts a complete long-form first generation at the 4,800-character boundary", () => {
    const response = createLongFormResponse(4_800, 5);

    const document = new EditorialGenerationStrategy().parse(response, input);

    const proseLength = document.blocks
      .filter((block) => block.type === "paragraph")
      .reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
    expect(proseLength).toBe(4_800);
  });

  it.each([4, 7])("rejects %i H2 sections", (sectionCount) => {
    expect(() => new EditorialGenerationStrategy().parse(createLongFormResponse(6_000, sectionCount), input))
      .toThrow("LONG_FORM_INVALID_H2_COUNT");
  });

  it("rejects a shallow H2 section even when the total article is long enough", () => {
    const response = createLongFormResponse(4_800, 5, 0);
    expect(() => new EditorialGenerationStrategy().parse(response, input))
      .toThrow(/LONG_FORM_SHALLOW_SECTION.*핵심 기준 1.*449/);
  });

  it("converts the structured DTO deterministically and keeps introduction and conclusion outside H2 counts", () => {
    const document = new EditorialGenerationStrategy().parse(createLongFormResponse(6_000, 6), input);
    expect(document.blocks[0]).toMatchObject({ id: "introduction-1", type: "paragraph" });
    expect(document.metadata?.longFormStructure?.sections).toHaveLength(6);
    expect(document.metadata?.longFormStructure?.introductionBlockIds).toEqual(["introduction-1"]);
    expect(document.metadata?.longFormStructure?.conclusionBlockIds).toEqual(["conclusion-1"]);
    const total = document.blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
    expect(total).toBeGreaterThanOrEqual(5_500);
  });
});

function createLongFormResponse(proseCharacters: number, sectionCount: number, shallowSectionIndex?: number): string {
  const introductionLength = 400;
  const conclusionLength = 400;
  const sectionBudget = proseCharacters - introductionLength - conclusionLength;
  const minimumPerSection = 450;
  const sectionLengths = Array.from({ length: sectionCount }, () => Math.floor(sectionBudget / sectionCount));
  sectionLengths[sectionCount - 1] += sectionBudget - sectionLengths.reduce((sum, length) => sum + length, 0);
  if (typeof shallowSectionIndex === "number") {
    const transferred = sectionLengths[shallowSectionIndex] - (minimumPerSection - 1);
    sectionLengths[shallowSectionIndex] = minimumPerSection - 1;
    sectionLengths[(shallowSectionIndex + 1) % sectionCount] += transferred;
  }

  return JSON.stringify({
    title: "건강 정보 실천 가이드",
    metaDescription: "건강 정보를 이해하고 생활에서 적용할 때 확인해야 할 기준과 주의사항을 구체적으로 정리한 실천 가이드입니다.",
    primarySearchIntent: "건강 정보를 안전하게 적용하는 기준",
    secondaryIntent: "실천 순서 확인",
    secondaryKeywords: ["건강 기준"],
    relatedTerms: ["생활 점검"],
    tags: ["건강정보", "생활점검", "실천기준", "안전정보", "건강관리"],
    introduction: ["가".repeat(introductionLength)],
    sections: sectionLengths.map((length, index) => ({
      heading: `핵심 기준 ${index + 1}`,
      paragraphs: ["가".repeat(Math.floor(length / 2)), "나".repeat(length - Math.floor(length / 2))],
    })),
    conclusion: ["다".repeat(conclusionLength)],
    images: [],
    cta: [],
  });
}
