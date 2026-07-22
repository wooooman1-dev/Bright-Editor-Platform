import { describe, expect, it } from "vitest";

import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";

describe("EditorialGenerationStrategy", () => {
  it("enforces the complete long-form generation contract without a maximum length", () => {
    const request = new EditorialGenerationStrategy().createRequest({
      contentType: "article" as never,
      keywords: ["건강 정보"],
      platform: "tistory" as never,
      projectId: "project-1",
    });

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
});
