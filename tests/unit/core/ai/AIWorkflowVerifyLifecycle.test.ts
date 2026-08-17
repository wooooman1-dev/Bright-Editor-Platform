import { describe, expect, it, vi } from "vitest";

import { type AIProvider, type AIRequest, type AIResponse, type ContentGenerationStrategy, type GenerationInput } from "../../../../core/ai";
import { AIWorkflow } from "../../../../core/ai/AIWorkflow";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import { confirmContentOpportunity, createContentOpportunityCandidate, createContentOpportunityVerificationPlan, type ContentDocument } from "../../../../core/content";

const evidenceUrl = "https://www.fss.or.kr/card/cancel";
const evidenceExcerpt = "카드 결제 취소 처리와 카드사 청구 반영은 서로 다른 단계일 수 있습니다.";

class SourceFirstProvider implements AIProvider {
  readonly requests: AIRequest[] = [];
  constructor(private readonly responses: readonly AIResponse[]) {}

  async generate(request: AIRequest): Promise<AIResponse> {
    this.requests.push(request);
    const response = this.responses[this.requests.length - 1];
    if (!response) throw new Error("Unexpected extra provider call.");
    return response;
  }
}

function sourceDiscoveryResponse(): AIResponse {
  return {
    content: JSON.stringify({
      sources: [{ url: evidenceUrl, title: "카드 결제 취소 안내" }],
    }),
    model: "test-model",
    diagnostics: { stage: "generation", webSearchCalls: 0 },
  };
}

function generationResponse(): AIResponse {
  return {
    content: JSON.stringify({ ok: true }),
    model: "test-model",
    diagnostics: { stage: "generation", webSearchCalls: 0 },
  };
}

function opportunity() {
  const candidate = createContentOpportunityCandidate({
    sourceRequest: "카드 명세서 확인 방법",
    selectionMode: "userSpecified",
    selectedTopic: "카드 명세서 확인 방법",
    primaryKeyword: "카드 명세서 확인 방법",
    secondaryKeywords: ["카드 결제 취소"],
    searchIntent: "카드 취소와 청구 반영 확인 순서",
    audience: "카드 이용자",
    contentType: "article",
    contentAngle: "확인 순서",
    readerProblem: "청구 상태 판단이 어려움",
    expectedCoverage: ["취소 처리", "청구 반영"],
    selectionRationale: "실용 정보",
    opportunityEvidence: [], confidence: 0.8, cautions: [], projectId: "p",
    verificationPlan: createContentOpportunityVerificationPlan([]),
  });
  return confirmContentOpportunity(candidate, {
    workspaceId: "w",
    projectId: "p",
    contentId: "c",
    confirmedAt: "2026-08-09T00:00:00.000Z",
  });
}

function strategy(): ContentGenerationStrategy {
  return {
    createRequest: () => ({ instruction: "Write the article." }),
    parse: () => ({
      id: "c", title: "카드 명세서 확인 방법",
      blocks: [{ id: "p1", type: "paragraph" as const, text: "카드 명세서에서 취소 내역을 확인하세요." }],
      metadata: {
        buttonCount: 0,
        createdAt: "2026-08-09T00:00:00.000Z",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "2026-08-09T00:00:00.000Z",
        version: 1,
        videoCount: 0,
        wordCount: 20,
      },
    } satisfies ContentDocument),
  };
}

function input(): GenerationInput {
  return {
    contentId: "c",
    contentType: "article" as never,
    contentOpportunity: opportunity(),
    editorialContext: approvalPolicyPromptContext(
      resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
    ),
    keywords: ["카드 명세서 확인 방법"],
    platform: "wordpress" as never,
    projectId: "p",
    structuredLongFormOutput: true,
  };
}

function fetcher(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(
    `<html><head><title>카드 결제 취소 안내</title></head><body><main><p>${evidenceExcerpt}</p></main></body></html>`,
    { status: 200, headers: { "content-type": "text/html" } },
  ));
}

describe("AIWorkflow Official Source First lifecycle", () => {
  it("acquires the official source before the single article-generation call", async () => {
    const provider = new SourceFirstProvider([sourceDiscoveryResponse(), generationResponse()]);
    const verifyEvidenceFetcher = fetcher();

    const result = await new AIWorkflow(provider, strategy(), { verifyEvidenceFetcher }).generate(input());

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]?.metadata?.task).toBe("official-source-first-discovery");
    expect(provider.requests[1]?.metadata?.task).toBe("content-generation");
    expect(provider.requests[1]?.instruction).toContain(evidenceUrl);
    expect(provider.requests[1]?.instruction).toContain("Official Source First contract");
    expect(verifyEvidenceFetcher).toHaveBeenCalledOnce();
    expect(result.document.blocks).toHaveLength(1);
  });

  it("does not start article generation when Official Source First cannot acquire an authoritative source", async () => {
    const provider = new SourceFirstProvider([sourceDiscoveryResponse(), generationResponse()]);
    const verifyEvidenceFetcher = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(new AIWorkflow(provider, strategy(), { verifyEvidenceFetcher }).generate(input()))
      .rejects.toMatchObject({ code: "APPROVAL_SOURCE_NOT_READY" });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.metadata?.task).toBe("official-source-first-discovery");
  });

  it("fails before article generation when source discovery returns invalid JSON", async () => {
    const provider = new SourceFirstProvider([
      { ...sourceDiscoveryResponse(), content: "not-json" },
      generationResponse(),
    ]);
    const verifyEvidenceFetcher = vi.fn();

    await expect(new AIWorkflow(provider, strategy(), { verifyEvidenceFetcher }).generate(input()))
      .rejects.toMatchObject({ code: "APPROVAL_SOURCE_NOT_READY" });
    expect(provider.requests).toHaveLength(1);
    expect(verifyEvidenceFetcher).not.toHaveBeenCalled();
  });
});