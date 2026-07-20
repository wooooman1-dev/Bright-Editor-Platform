import { describe, expect, it } from "vitest";

import {
  defaultOpenAIGenerationModel,
  defaultOpenAIReviewModel,
  resolveOpenAIModelPolicy,
} from "../../../../app/application/OpenAIModelPolicy";

describe("OpenAIModelPolicy", () => {
  it("uses Terra for generation and Sol for final quality editing by default", () => {
    expect(resolveOpenAIModelPolicy({})).toEqual({
      generationModel: "gpt-5.6-terra",
      reviewModel: "gpt-5.6-sol",
    });
    expect(defaultOpenAIGenerationModel).toBe("gpt-5.6-terra");
    expect(defaultOpenAIReviewModel).toBe("gpt-5.6-sol");
  });

  it("uses explicit role-specific overrides", () => {
    expect(resolveOpenAIModelPolicy({ OPENAI_GENERATION_MODEL: "generation", OPENAI_REVIEW_MODEL: "review" })).toEqual({ generationModel: "generation", reviewModel: "review" });
  });

  it("does not route role-based work through legacy OPENAI_MODEL", () => {
    expect(resolveOpenAIModelPolicy({ OPENAI_MODEL: "gpt-5-mini" })).toEqual({
      generationModel: "gpt-5.6-terra",
      reviewModel: "gpt-5.6-sol",
    });
  });
});
