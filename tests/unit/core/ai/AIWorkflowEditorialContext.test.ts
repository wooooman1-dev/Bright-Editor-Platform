import { describe, expect, it } from "vitest";

import type { AIProvider, AIRequest } from "../../../../core/ai";
import {
  AIWorkflow,
  withCanonicalEditorialContext,
  type ContentGenerationStrategy,
  type GenerationInput,
} from "../../../../core/ai/AIWorkflow";

const approvalContext = [
  "Content purpose: adsense_approval",
  "Approval policy: adsense_approval_mode@1.0",
  "Approval profile: tistory_vivarain_art_v1@1.0",
].join("\n");

const input: GenerationInput = {
  contentId: "content-1",
  contentType: "article" as GenerationInput["contentType"],
  editorialContext: approvalContext,
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
  parse: () => ({
    id: "content-1",
    title: "Title",
    blocks: [],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: "2026-07-27T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 0,
    },
  }),
};

describe("AIWorkflow canonical editorial context", () => {
  it("appends server editorial context and snapshots it into the generated document", async () => {
    const provider = new RecordingProvider();
    const result = await new AIWorkflow(provider, strategy).generate(input);

    expect(provider.request?.instruction).toContain("Canonical server editorial context");
    expect(provider.request?.instruction).toContain("Approval policy: adsense_approval_mode@1.0");
    expect(result.document.metadata?.approvalPolicy).toMatchObject({
      policyId: "adsense_approval_mode",
      policyVersion: "1.0",
      profileId: "tistory_vivarain_art_v1",
      profileVersion: "1.0",
    });
  });

  it("does not duplicate context already included by a strategy", () => {
    const instruction = `Write the article.\n${approvalContext}`;

    expect(withCanonicalEditorialContext(instruction, approvalContext)).toBe(instruction);
  });

  it("keeps standard generation unchanged when no context exists", () => {
    expect(withCanonicalEditorialContext("Write the article.")).toBe("Write the article.");
  });
});
