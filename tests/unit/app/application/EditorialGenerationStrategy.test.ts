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
    expect(request.instruction).toContain("use five or six developed H2 sections by default");
    expect(request.instruction).toContain("never create eight or more");
    expect(request.instruction).toContain("at least 450 non-whitespace Korean prose characters");
    expect(request.instruction).toContain("Do not add sections merely to reach the length target");
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

  it("allows a structurally deep first generation below 4,800 characters so the quality pipeline can improve it", () => {
    const response = createLongFormResponse(4_799, 5);

    const document = new EditorialGenerationStrategy().parse(response, input);

    const proseLength = document.blocks
      .filter((block) => block.type === "paragraph")
      .reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
    expect(proseLength).toBe(4_799);
  });

  it("accepts a complete long-form first generation at the 4,800-character boundary", () => {
    const response = createLongFormResponse(4_800, 5);

    const document = new EditorialGenerationStrategy().parse(response, input);

    const proseLength = document.blocks
      .filter((block) => block.type === "paragraph")
      .reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
    expect(proseLength).toBe(4_800);
  });

  it("rejects eight H2 sections that fragment a long-form article", () => {
    expect(() => new EditorialGenerationStrategy().parse(createLongFormResponse(4_800, 8), input))
      .toThrow("expected five to seven developed sections");
  });

  it("rejects a shallow H2 section even when the total article is long enough", () => {
    const response = createLongFormResponse(4_800, 5, 0);
    expect(() => new EditorialGenerationStrategy().parse(response, input))
      .toThrow("every H2 requires at least 450 non-whitespace prose characters");
  });
});

function createLongFormResponse(proseCharacters: number, sectionCount: number, shallowSectionIndex?: number): string {
  const minimumPerSection = 450;
  const sectionLengths = Array.from({ length: sectionCount }, () => Math.floor(proseCharacters / sectionCount));
  sectionLengths[sectionCount - 1] += proseCharacters - sectionLengths.reduce((sum, length) => sum + length, 0);
  if (typeof shallowSectionIndex === "number") {
    const transferred = sectionLengths[shallowSectionIndex] - (minimumPerSection - 1);
    sectionLengths[shallowSectionIndex] = minimumPerSection - 1;
    sectionLengths[(shallowSectionIndex + 1) % sectionCount] += transferred;
  }

  return JSON.stringify({
    title: "건강 정보 실천 가이드",
    metaDescription: "건강 정보를 이해하고 생활에서 적용할 때 확인해야 할 기준과 주의사항을 구체적으로 정리한 실천 가이드입니다.",
    blocks: sectionLengths.flatMap((length, index) => [
      { type: "heading", level: 2, text: `핵심 기준 ${index + 1}` },
      { type: "paragraph", text: "가".repeat(length) },
    ]),
  });
}
