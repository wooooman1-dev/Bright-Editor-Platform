import { describe, expect, it } from "vitest";

import type { AIProvider, AIRequest } from "../../../../core/ai";
import {
  AIWorkflow,
  withCanonicalEditorialContext,
  type ContentGenerationStrategy,
  type GenerationInput,
} from "../../../../core/ai/AIWorkflow";

const input: GenerationInput = {
  contentId: "content-1",
  contentType: "article" as GenerationInput["contentType"],
  editorialContext: "Approval policy: adsense_approval_mode@1.0",
  keywords: ["미술 감상"],
  platform: "tistory" as GenerationInput["platform"],
  projectId: "project-1",
};

class RecordingProvider implements AIProvider {
  request?: AIRequest;

  async generate(request: AIRequest) {
    this.request = request;
    return { content: "generated", model: "test" };
  }
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the article." }),
  parse: () => ({ id: "content-1", title: "Title", blocks: [] }),
};

describe("AIWorkflow canonical editorial context", () => {
  it("appends server editorial context when the strategy omitted it", async () => {
    const provider = new RecordingProvider();
    await new AIWorkflow(provider, strategy).generate(input);

    expect(provider.request?.instruction).toContain("Canonical server editorial context");
    expect(provider.request?.instruction).toContain("Approval policy: adsense_approval_mode@1.0");
  });

  it("does not duplicate context already included by a strategy", () => {
    const context = "Approval policy: adsense_approval_mode@1.0";
    const instruction = `Write the article.\n${context}`;

    expect(withCanonicalEditorialContext(instruction, context)).toBe(instruction);
  });

  it("keeps standard generation unchanged when no context exists", () => {
    expect(withCanonicalEditorialContext("Write the article.")).toBe("Write the article.");
  });
});
