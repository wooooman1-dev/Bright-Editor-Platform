import { describe, expect, it, vi } from "vitest";

import { EditorialQualityPipeline } from "../../../../app/application/EditorialQualityPipeline";
import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import type { AIProvider, AIRequest } from "../../../../core/ai";

function article() {
  const prose = "독자가 바로 실행할 수 있는 기준과 순서, 구체적인 예시, 주의할 점을 자연스럽게 연결해 충분히 설명합니다. ".repeat(14);
  return {
    title: "완성된 실용 가이드",
    metaDescription: "독자가 필요한 기준과 실행 순서, 주의사항을 구체적으로 확인할 수 있도록 정리한 실용 가이드입니다.",
    blocks: [
      { type: "paragraph", text: prose },
      ...Array.from({ length: 5 }, (_, index) => [
        { type: "heading", level: 2, text: `구체적인 실행 단계 ${index + 1}` },
        { type: "paragraph", text: prose },
        { type: "paragraph", text: prose },
      ]).flat(),
      { type: "paragraph", text: prose },
    ],
  };
}

function articleWithVerifiedLinks() {
  const value = article();
  return { ...value, blocks: [...value.blocks,
    { type: "button", purpose: "internal_link", label: "실제 내부 글", targetUrl: "https://bright-healthy.tistory.com/entry/verified-internal", target: "_self", sourceExternalPostId: "post-1" },
    ...Array.from({ length: 3 }, (_, index) => ({ type: "button", purpose: "related_post", label: `실제 관련 글 ${index + 1}`, targetUrl: `https://bright-healthy.tistory.com/entry/verified-related-${index + 1}`, target: "_self", sourceExternalPostId: `post-${index + 2}` })),
  ] };
}

describe("EditorialQualityPipeline", () => {
  it("stops after three automatic improvements and returns the highest-scoring manuscript", async () => {
    const response = JSON.stringify(article());
    const generate = vi.fn(async (request: AIRequest) => { void request; return { content: response, model: "test-model" }; });
    const provider: AIProvider = { generate };
    const parseInput = { contentId: "content-1", contentType: "article" as never, keywords: ["실용 가이드"], platform: "tistory" as never, projectId: "project-1" };
    const initial = new EditorialGenerationStrategy().parse(response, parseInput);

    const result = await new EditorialQualityPipeline(provider).run({
      document: initial,
      finalReviewInstruction: () => "final review",
      parseInput,
      qualityContext: { contentType: "article", platform: "tistory", primaryKeyword: "실용 가이드" },
    });

    expect(result.reachedTarget).toBe(false);
    expect(result.automaticImprovementCount).toBe(3);
    expect(result.qualityHistory).toHaveLength(5);
    expect(generate).toHaveBeenCalledTimes(4);
    for (const call of generate.mock.calls.slice(1)) {
      expect(call[0].instruction).toContain("Rule Quality result:");
      expect(call[0].instruction).toContain("\"dimensions\"");
      expect(call[0].instruction).toContain("\"tasks\"");
    }
    expect(result.quality.overallScore).toBe(Math.max(...result.qualityHistory.slice(1).map((quality) => quality.overallScore)));
  });

  it("rejects final-review and improvement responses that remove verified catalog links", async () => {
    const linked = JSON.stringify(articleWithVerifiedLinks());
    const withoutLinks = JSON.stringify(article());
    const generate = vi.fn(async (request: AIRequest) => { void request; return { content: withoutLinks, model: "test-model" }; });
    const parseInput = { contentId: "content-links", contentType: "article" as never, keywords: ["실용 가이드"], platform: "tistory" as never, projectId: "project-1" };
    const initial = new EditorialGenerationStrategy().parse(linked, parseInput);
    const result = await new EditorialQualityPipeline({ generate }).run({ document: initial, finalReviewInstruction: () => "final", parseInput, qualityContext: { contentType: "article", platform: "tistory", primaryKeyword: "실용 가이드" } });
    const finalLinks = result.document.blocks.filter((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post"));
    expect(finalLinks).toHaveLength(4);
    expect(result.attemptHistory).toHaveLength(4);
    expect(result.attemptHistory.every((attempt) => attempt.accepted === false && attempt.rejectionReason === "verified_link_changed_or_removed")).toBe(true);
  });

  it("rejects an AI revision that adds a URL outside the verified catalog set", async () => {
    const linkedArticle = articleWithVerifiedLinks();
    const invented = { ...linkedArticle, blocks: [...linkedArticle.blocks, { type: "button", purpose: "related_post", label: "검증되지 않은 글", targetUrl: "https://bright-healthy.tistory.com/entry/not-in-catalog", target: "_self", sourceExternalPostId: "invented" }] };
    const linked = JSON.stringify(linkedArticle), inventedResponse = JSON.stringify(invented);
    const generate = vi.fn(async (request: AIRequest) => { void request; return { content: inventedResponse, model: "test-model" }; });
    const parseInput = { contentId: "content-url", contentType: "article" as never, keywords: ["실용 가이드"], platform: "tistory" as never, projectId: "project-1" };
    const initial = new EditorialGenerationStrategy().parse(linked, parseInput);
    const result = await new EditorialQualityPipeline({ generate }).run({ document: initial, finalReviewInstruction: () => "final", parseInput, qualityContext: { contentType: "article", platform: "tistory", primaryKeyword: "실용 가이드" } });
    expect(result.attemptHistory.every((attempt) => attempt.rejectionReason === "unverified_url_added")).toBe(true);
    expect(result.document.blocks.some((block) => block.type === "button" && block.targetUrl.includes("not-in-catalog"))).toBe(false);
  });

  it("passes completeness, usefulness, heading depth, missing requirements, and link state to improvements", async () => {
    const response = JSON.stringify(article());
    const generate = vi.fn(async (request: AIRequest) => { void request; return { content: response, model: "test-model" }; });
    const parseInput = { contentId: "content-diagnostics", contentType: "article" as never, keywords: ["실용 가이드"], platform: "tistory" as never, projectId: "project-1" };
    const initial = new EditorialGenerationStrategy().parse(response, parseInput);
    await new EditorialQualityPipeline({ generate }).run({ document: initial, finalReviewInstruction: () => "final", parseInput, qualityContext: { contentType: "article", platform: "tistory", primaryKeyword: "실용 가이드" }, requiredInformation: ["실제 작성 예시", "응급 신호와 일반 상담 구분"] });
    const instruction = generate.mock.calls[1]?.[0].instruction ?? "";
    expect(instruction).toContain('"category":"completeness"');
    expect(instruction).toContain('"category":"usefulness"');
    expect(instruction).toContain("headingCharacterCounts");
    expect(instruction).toContain("missingRequiredInformation");
    expect(instruction).toContain("repeatedOrShallowParagraphs");
    expect(instruction).toContain("linkState");
  });
});
