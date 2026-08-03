import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AIWorkflow,
  createAIUsageRecord,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type ContentGenerationStrategy,
  type GenerationInput,
} from "../../../../core/ai";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
} from "../../../../core/content";

const sourceUrl = "https://www.gov.kr/portal/service/serviceInfo/test";
const evidenceExcerpt = "지원 대상과 신청 조건은 공식 안내 페이지에서 확인할 수 있습니다.";

class QueueProvider implements AIProvider {
  readonly requests: AIRequest[] = [];

  constructor(private readonly responses: readonly AIResponse[]) {}

  async generate(request: AIRequest): Promise<AIResponse> {
    this.requests.push(request);
    const response = this.responses[this.requests.length - 1];
    if (!response) throw new Error("Unexpected provider call.");
    return response;
  }
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the complete article." }),
  parse: () => ({
    id: "content-1",
    title: "정부 지원 신청 조건 확인 방법",
    blocks: [],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-03T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: "2026-08-03T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 0,
    },
  }),
};

function generationInput(): GenerationInput {
  const candidate = createContentOpportunityCandidate({
    sourceRequest: "정부 지원 신청 조건 확인 방법 글을 작성해줘",
    selectionMode: "userSpecified",
    selectedTopic: "정부 지원 신청 조건 확인 방법",
    primaryKeyword: "정부 지원 신청 조건 확인 방법",
    secondaryKeywords: ["지원 대상 확인"],
    searchIntent: "공식 페이지에서 지원 대상과 신청 조건을 확인하는 방법",
    audience: "정부 지원 신청 가능 여부를 확인하려는 독자",
    contentType: "article",
    contentAngle: "공식 확인 경로와 적용 조건 중심",
    readerProblem: "자신이 신청 대상인지 판단하기 어려움",
    expectedCoverage: ["지원 대상", "신청 조건", "공식 재확인 경로"],
    selectionRationale: "사용자가 지정한 정보 탐색 주제",
    opportunityEvidence: [{ source: "unknown", summary: "공식 출처는 생성 전 확인 필요" }],
    confidence: 0.7,
    cautions: [],
    projectId: "project-1",
  });
  const opportunity = confirmContentOpportunity(candidate, {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    confirmedAt: "2026-08-03T00:00:00.000Z",
  });
  return {
    contentId: "content-1",
    contentType: "article" as GenerationInput["contentType"],
    contentOpportunity: opportunity,
    editorialContext: approvalPolicyPromptContext(
      resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
    ),
    keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
    platform: "wordpress" as GenerationInput["platform"],
    projectId: "project-1",
    structuredLongFormOutput: true,
  };
}

function preflightResponse(): AIResponse {
  return {
    content: JSON.stringify({
      sources: [{
        url: sourceUrl,
        title: "정부24 공식 안내",
        evidenceExcerpt,
        claims: [{
          field: "eligibility",
          value: evidenceExcerpt,
        }],
      }],
    }),
    model: "gpt-5.6-terra",
    diagnostics: {
      webSources: [{ url: sourceUrl, title: "정부24 공식 안내", provenance: "search_candidate" }],
      aiUsage: createAIUsageRecord({
        stage: "source_preflight",
        task: "approval-source-preflight",
        model: "gpt-5.6-terra",
        responseId: "response-preflight",
        recordedAt: "2026-08-03T00:00:00.000Z",
        inputTokens: 500,
        outputTokens: 100,
        totalTokens: 600,
        webSearchCalls: 1,
      }),
    },
  };
}

function generationResponse(): AIResponse {
  return {
    content: "generated",
    model: "gpt-5.6-terra",
    diagnostics: {
      aiUsage: createAIUsageRecord({
        stage: "generation",
        task: "content-generation",
        model: "gpt-5.6-terra",
        responseId: "response-generation",
        recordedAt: "2026-08-03T00:01:00.000Z",
        inputTokens: 1_000,
        outputTokens: 500,
        totalTokens: 1_500,
      }),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Approval Source Preflight", () => {
  it("validates an official source before calling manuscript Generation", async () => {
    const provider = new QueueProvider([preflightResponse(), generationResponse()]);
    const pageText = `${evidenceExcerpt} 신청 전에 지원 대상, 제출 서류, 신청 기간과 최신 공고를 함께 확인해야 합니다. `.repeat(8);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      `<html><head><title>정부24 공식 안내</title></head><body>${pageText}</body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    const result = await new AIWorkflow(provider, strategy).generate(generationInput());

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]?.metadata?.task).toBe("approval-source-preflight");
    expect(provider.requests[1]?.metadata).toMatchObject({
      task: "content-generation",
      approvalEvidenceMode: "preflight_verified",
    });
    expect(provider.requests[1]?.instruction).toContain("Approval source preflight bundle");
    expect(provider.requests[1]?.instruction).toContain(sourceUrl);
    expect(provider.requests[1]?.instruction).not.toContain("Use the attached web search tool during this same Generation call");
    expect(result.document.metadata?.approvalEvidence?.sources).toMatchObject([{
      url: sourceUrl,
      provenance: "citation",
      cited: true,
      selected: true,
      citationExcerpt: evidenceExcerpt,
    }]);
    expect(result.document.metadata?.aiUsage?.map((record) => record.stage)).toEqual([
      "source_preflight",
      "generation",
    ]);
  });

  it("does not call manuscript Generation when every discovered source is unusable", async () => {
    const provider = new QueueProvider([preflightResponse()]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new Uint8Array([0, 1, 2, 3, 4, 5]),
      { status: 200, headers: { "content-type": "image/png" } },
    )));

    await expect(new AIWorkflow(provider, strategy).generate(generationInput()))
      .rejects.toThrow("원고 생성을 시작하지 않았습니다");
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.metadata?.task).toBe("approval-source-preflight");
  });

  it("rejects a URL invented in JSON but absent from the actual web-search sources", async () => {
    const response = preflightResponse();
    const provider = new QueueProvider([{
      ...response,
      diagnostics: {
        ...response.diagnostics,
        webSources: [{
          url: "https://www.gov.kr/portal/service/serviceInfo/different",
          provenance: "search_candidate",
        }],
      },
    }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new AIWorkflow(provider, strategy).generate(generationInput()))
      .rejects.toThrow("웹 검색 도구가 실제로 확인한 직접 출처 URL이 없습니다");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.requests).toHaveLength(1);
  });
});
