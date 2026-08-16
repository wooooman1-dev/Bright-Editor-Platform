import { describe, expect, it } from "vitest";

import {
  defaultOpenAIGenerationModel,
  defaultOpenAIReviewModel,
  defaultOpenAISourcePreflightModel,
  resolveOpenAIModelPolicy,
} from "../../../../app/application/OpenAIModelPolicy";

describe("OpenAIModelPolicy", () => {
  it("uses Terra for generation, Sol for final quality editing, and Luna for source preflight by default", () => {
    expect(resolveOpenAIModelPolicy({})).toEqual({
      generationModel: "gpt-5.6-terra",
      reviewModel: "gpt-5.6-sol",
      sourcePreflightModel: "gpt-5.6-luna",
    });
    expect(defaultOpenAIGenerationModel).toBe("gpt-5.6-terra");
    expect(defaultOpenAIReviewModel).toBe("gpt-5.6-sol");
    expect(defaultOpenAISourcePreflightModel).toBe("gpt-5.6-luna");
  });

  it("uses explicit role-specific overrides", () => {
    expect(resolveOpenAIModelPolicy({
      OPENAI_GENERATION_MODEL: "generation",
      OPENAI_REVIEW_MODEL: "review",
      OPENAI_SOURCE_PREFLIGHT_MODEL: "preflight",
    })).toEqual({
      generationModel: "generation",
      reviewModel: "review",
      sourcePreflightModel: "preflight",
    });
  });

  it("does not route role-based work through legacy OPENAI_MODEL", () => {
    expect(resolveOpenAIModelPolicy({ OPENAI_MODEL: "gpt-5-mini" })).toEqual({
      generationModel: "gpt-5.6-terra",
      reviewModel: "gpt-5.6-sol",
      sourcePreflightModel: "gpt-5.6-luna",
    });
  });
});
