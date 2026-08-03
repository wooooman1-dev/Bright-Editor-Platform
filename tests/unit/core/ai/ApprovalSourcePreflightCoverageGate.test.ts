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
import {
  approvalPolicyPromptContext,
  resolveApprovalPolicySnapshot,
} from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
} from "../../../../core/content";

const fscUrl = "https://www.fsc.go.kr/no010101/84975";
const lawUrl = "https://law.go.kr/lsInfoP.do?efYd=20250901&lsiSeq=273001&urlMode=lsInfoP";

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
    id: "content-deposit",
    title: "예금자보호 한도 확인 방법",
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
    sourceRequest: "예금자보호 한도 확인 방법 글을 작성해줘",
    selectionMode: "userSpecified",
    selectedTopic: "예금자보호 한도 확인 방법",
    primaryKeyword: "예금자보호 한도 확인 방법",
    secondaryKeywords: ["예금보험공사 보호 여부 확인"],
    searchIntent: "예금자보호 대상, 금융회사별 한도, 시행일과 공식 확인 경로 파악",
    audience: "보유 예금의 보호 범위를 확인하려는 독자",
    contentType: "article",
    contentAngle: "보호 대상과 금융회사별 합산 기준 중심",
    readerProblem: "보유 계좌가 보호 한도 안에 있는지 판단하기 어려움",
    expectedCoverage: [
      "보호 대상 금융상품",
      "1억원 보호 한도와 금융회사별 적용 단위",
      "보호 제외 항목",
      "예금보험공사 확인 경로",
      "2025년 9월 1일 시행일과 예금자보호법 근거",
    ],
    selectionRationale: "사용자가 지정한 생활금융 주제",
    opportunityEvidence: [{
      source: "unknown",
      summary: "공식 출처는 Generation 전에 확인 필요",
    }],
    confidence: 0.8,
    cautions: [],
    projectId: "project-deposit",
  });
  const opportunity = confirmContentOpportunity(candidate, {
    workspaceId: "workspace-deposit",
    projectId: "project-deposit",
    contentId: "content-deposit",
    confirmedAt: "2026-08-03T00:00:00.000Z",
  });
  return {
    contentId: "content-deposit",
    contentType: "article" as GenerationInput["contentType"],
    contentOpportunity: opportunity,
    editorialContext: approvalPolicyPromptContext(
      resolveApprovalPolicySnapshot(
        "adsense_approval",
        "wordpress_life_economy_v1",
      )!,
    ),
    keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
    platform: "wordpress" as GenerationInput["platform"],
    projectId: "project-deposit",
    structuredLongFormOutput: true,
  };
}

function source(
  url: string,
  claims: readonly Readonly<{ field: string; value: string }>[],
): Readonly<{
  url: string;
  title: string;
  evidenceExcerpt: string;
  claims: readonly Readonly<{ field: string; value: string }>[];
}> {
  return {
    url,
    title: url === fscUrl ? "금융위원회 예금자보호 안내" : "예금자보호법 시행령",
    evidenceExcerpt: url === fscUrl
      ? "예금자는 한 금융회사에서 원금과 소정의 이자를 합하여 1억원까지 보호받습니다."
      : "예금자보호법 시행령은 2025년 9월 1일부터 시행합니다.",
    claims,
  };
}

function preflightResponse(
  sources: readonly ReturnType<typeof source>[],
): AIResponse {
  return {
    content: JSON.stringify({ sources }),
    model: "gpt-5.6-terra",
    diagnostics: {
      webSources: sources.map((item) => ({
        url: item.url,
        title: item.title,
        provenance: "search_candidate" as const,
      })),
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

function pageHtml(url: string): string {
  const body = url === fscUrl
    ? "예금자는 한 금융회사에서 원금과 소정의 이자를 합하여 1억원까지 보호받습니다. 예금자보호 대상 금융상품과 보호 대상이 아닌 보호 제외 상품, 금융회사별 1인 적용 단위, 예금보험공사 확인 경로를 안내합니다. "
    : "예금자보호법 시행령은 2025년 9월 1일부터 시행합니다. [시행 2025. 9. 1.] 원금과 이자를 합한 1억원의 보호 한도와 금융회사별 1인 적용 단위를 규정합니다. ";
  return `<html><head><title>공식 안내</title></head><body>${body.repeat(10)}</body></html>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Approval Source Preflight Coverage Gate", () => {
  it("blocks manuscript Generation when official sources cover only part of required Claims", async () => {
    const provider = new QueueProvider([
      preflightResponse([source(lawUrl, [
        { field: "depositProtectionLimit", value: "원금과 이자를 합한 1억원" },
        { field: "depositProtectionUnit", value: "금융회사별 1인" },
        { field: "depositProtectionEffectiveDate", value: "2025년 9월 1일" },
        { field: "depositProtectionStatutoryBasis", value: "예금자보호법 시행령" },
      ])]),
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(
      pageHtml(String(input)),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    await expect(new AIWorkflow(provider, strategy).generate(generationInput()))
      .rejects.toThrow(
        "미확보 Claim: depositProtectedProducts, depositProtectionExclusions, depositProtectionCheckPath",
      );
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.metadata?.task).toBe("approval-source-preflight");
  });

  it("allows one Generation call only after every required Claim is covered", async () => {
    const provider = new QueueProvider([
      preflightResponse([
        source(fscUrl, [
          { field: "depositProtectedProducts", value: "예금자보호 대상 금융상품" },
          { field: "depositProtectionLimit", value: "원금과 이자를 합하여 1억원" },
          { field: "depositProtectionUnit", value: "금융회사별 1인" },
          { field: "depositProtectionExclusions", value: "보호 대상이 아닌 보호 제외 상품" },
          { field: "depositProtectionCheckPath", value: "예금보험공사 확인 경로" },
        ]),
        source(lawUrl, [
          { field: "depositProtectionEffectiveDate", value: "2025년 9월 1일" },
          { field: "depositProtectionStatutoryBasis", value: "예금자보호법 시행령" },
        ]),
      ]),
      generationResponse(),
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(
      pageHtml(String(input)),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    const result = await new AIWorkflow(provider, strategy).generate(generationInput());

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]?.instruction).toContain("Required Claim coverage contract");
    expect(provider.requests[1]?.metadata).toMatchObject({
      task: "content-generation",
      approvalEvidenceMode: "preflight_verified",
    });
    expect(result.document.metadata?.approvalEvidence?.sources).toHaveLength(2);
  });
});
