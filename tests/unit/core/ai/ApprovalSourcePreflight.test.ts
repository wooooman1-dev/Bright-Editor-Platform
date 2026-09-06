import { afterEach, describe, expect, it, vi } from "vitest";

import { AIWorkflow } from "../../../../core/ai/AIWorkflow";
import { ApprovalSourcePreflightError } from "../../../../core/ai/ApprovalSourcePreflight";
import {
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

const sourceUrl = "https://www.gov.kr/portal/service/serviceInfo/test";
const secondSourceUrl =
  "https://www.gov.kr/portal/service/serviceInfo/test-amount";
const sourceEvidenceExcerpt =
  "지원 대상과 신청 조건은 공식 안내 페이지에서 확인할 수 있습니다.";
const eligibilityValue = "공식 안내의 지원 대상과 신청 조건";
const eligibilityEvidenceExcerpt =
  "공식 안내의 지원 대상과 신청 조건을 신청 전에 확인해야 합니다.";

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

function generationInput(input: Readonly<{
  topic?: string;
  secondaryKeywords?: readonly string[];
  expectedCoverage?: readonly string[];
  searchIntent?: string;
  readerProblem?: string;
}> = {}): GenerationInput {
  const topic = input.topic ?? "정부 지원 신청 조건 확인 방법";
  const candidate = createContentOpportunityCandidate({
    sourceRequest: `${topic} 글을 작성해줘`,
    selectionMode: "userSpecified",
    selectedTopic: topic,
    primaryKeyword: topic,
    secondaryKeywords: input.secondaryKeywords ?? ["지원 대상 확인"],
    searchIntent: input.searchIntent
      ?? "공식 페이지에서 지원 대상과 신청 조건을 확인하는 방법",
    audience: "정부 지원 신청 가능 여부를 확인하려는 독자",
    contentType: "article",
    contentAngle: "공식 확인 경로와 적용 조건 중심",
    readerProblem: input.readerProblem
      ?? "자신이 신청 대상인지 판단하기 어려움",
    expectedCoverage: input.expectedCoverage ?? [
      `지원 대상: ${eligibilityValue}`,
      "신청 조건",
      "공식 재확인 경로",
    ],
    selectionRationale: "사용자가 지정한 정보 탐색 주제",
    opportunityEvidence: [{
      source: "unknown",
      summary: "공식 출처는 생성 전 확인 필요",
    }],
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
      resolveApprovalPolicySnapshot(
        "adsense_approval",
        "wordpress_life_economy_v1",
      )!,
    ),
    keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
    platform: "wordpress" as GenerationInput["platform"],
    projectId: "project-1",
    structuredLongFormOutput: true,
  };
}

function source(input: Readonly<{
  url?: string;
  sourceExcerpt?: string;
  claims?: readonly Readonly<{
    claimId?: string;
    field: string;
    value: string;
    evidenceExcerpt: string;
  }>[];
}> = {}) {
  return {
    url: input.url ?? sourceUrl,
    title: "정부24 공식 안내",
    evidenceExcerpt: input.sourceExcerpt ?? sourceEvidenceExcerpt,
    claims: (input.claims ?? [{
      claimId: "eligibility",
      field: "eligibility",
      value: eligibilityValue,
      evidenceExcerpt: eligibilityEvidenceExcerpt,
    }]).map((claim) => ({ claimId: claim.claimId ?? claim.field, ...claim })),
  };
}

function preflightResponse(input: Readonly<{
  sources?: readonly ReturnType<typeof source>[];
  observedUrls?: readonly string[];
}> = {}): AIResponse {
  const sources = input.sources ?? [source()];
  const observedUrls = input.observedUrls ?? sources.map((item) => item.url);
  return {
    content: JSON.stringify({ sources }),
    model: "gpt-5.6-terra",
    diagnostics: {
      webSources: observedUrls.map((url) => ({
        url,
        title: "정부24 공식 안내",
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
    content: JSON.stringify({ verificationClaimsUsed: [] }),
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

function pageHtml(input: Readonly<{
  sourceExcerpt?: string;
  claimExcerpt?: string;
  extra?: string;
}> = {}): string {
  const text = [
    input.sourceExcerpt ?? sourceEvidenceExcerpt,
    input.claimExcerpt ?? eligibilityEvidenceExcerpt,
    input.extra ?? "신청 전에 제출 서류와 최신 공고도 확인해야 합니다.",
  ].join(" ");
  return `<html><head><title>정부24 공식 안내</title></head><body>${text.repeat(8)}</body></html>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Approval Source Preflight", () => {
  it("starts with manuscript Generation for the insurance check Opportunity", async () => {
    const provider = new QueueProvider([generationResponse()]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await new AIWorkflow(provider, strategy).generate(generationInput({
      topic: "보험료 점검 방법: 보장·갱신·해지 조건을 확인하는 순서",
      secondaryKeywords: [
        "보험 보장 내용 확인",
        "갱신형 비갱신형 차이",
        "보험 해지 전 확인사항",
      ],
      expectedCoverage: [
        "보장 금액 확인",
        "보장 기간 확인",
        "납입기간 확인",
        "갱신 여부 확인",
        "해지 영향 확인",
        "보장 대상·보장 기간·보장 금액·면책 및 제한 조건을 확인하는 순서",
      ],
      searchIntent: "보장, 갱신, 납입기간과 해지 영향을 확인하는 순서를 알고 싶어 한다.",
      readerProblem: "보험 계약 조건을 충분히 확인하지 않은 채 변경을 고려할 수 있다.",
    }));

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.metadata?.task).toBe("content-generation");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips Source Preflight discovery when scoped required Claims are empty", async () => {
    const provider = new QueueProvider([generationResponse()]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AIWorkflow(provider, strategy).generate(
      generationInput({
        expectedCoverage: [
          "예금과 적금의 납입 구조 차이",
          "금리 숫자를 볼 때 납입 방식과 기간을 함께 봐야 하는 이유",
          "예금자보호 확인 콘텐츠와 연결되는 금융회사별 예금 합산 점검 필요성",
        ],
        searchIntent: "예금과 적금의 차이와 선택 기준 확인",
        readerProblem: "금리 숫자만 비교해 어떤 상품 유형이 맞는지 판단하기 어려움",
      }),
    );

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.metadata?.task).toBe("content-generation");
    expect(provider.requests[0]?.instruction).not.toContain(
      "Required factual Claims",
    );
    expect(provider.requests[0]?.instruction).not.toContain(
      "Approval source preflight bundle",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.sourcePreflightDiagnostics).toBeUndefined();
    expect(result.document.metadata?.approvalEvidence).toBeUndefined();
    expect(result.document.metadata?.aiUsage?.map((record) => record.stage))
      .toEqual(["generation"]);
  });
  it("validates every required Claim before calling manuscript Generation", async () => {
    const provider = new QueueProvider([
      preflightResponse(),
      generationResponse(),
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      pageHtml(),
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    )));

    const result = await new AIWorkflow(provider, strategy)
      .generate(generationInput());

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]?.metadata?.task).toBe(
      "approval-source-preflight",
    );
    expect(provider.requests[0]?.instruction).toContain(
      "Required factual Claims",
    );
    expect(provider.requests[0]?.instruction).toContain(
      "Claim evidenceExcerpt",
    );
    expect(provider.requests[1]?.metadata).toMatchObject({
      task: "content-generation",
      approvalEvidenceMode: "preflight_verified",
    });
    expect(provider.requests[1]?.instruction).toContain(
      "Approval source preflight bundle",
    );
    expect(provider.requests[1]?.instruction).toContain(sourceUrl);
    expect(provider.requests[1]?.instruction).toContain(
      `Claim field: eligibility`,
    );
    expect(provider.requests[1]?.instruction).not.toContain(
      "Use the attached web search tool during this same Generation call",
    );
    expect(result.document.metadata?.approvalEvidence?.sources).toMatchObject([{
      url: sourceUrl,
      provenance: "system_verified",
      cited: true,
      selected: true,
      citationExcerpt: sourceEvidenceExcerpt,
      facts: [{
        field: "eligibility",
        value: eligibilityValue,
        excerpt: eligibilityEvidenceExcerpt,
      }],
    }]);
    expect(result.document.metadata?.aiUsage?.map((record) => record.stage))
      .toEqual(["source_preflight", "generation"]);
  });

  it("does not call manuscript Generation when every source is unusable", async () => {
    const provider = new QueueProvider([preflightResponse()]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new Uint8Array([0, 1, 2, 3, 4, 5]),
      { status: 200, headers: { "content-type": "image/png" } },
    )));

    await expect(
      new AIWorkflow(provider, strategy).generate(generationInput()),
    ).rejects.toThrow("원고 생성을 시작하지 않았습니다");
    expect(provider.requests).toHaveLength(1);
  });

  it("rejects a URL absent from the actual web-search sources", async () => {
    const provider = new QueueProvider([preflightResponse({
      observedUrls: [
        "https://www.gov.kr/portal/service/serviceInfo/different",
      ],
    })]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AIWorkflow(provider, strategy).generate(generationInput()),
    ).rejects.toThrow(
      "웹 검색 도구가 실제로 확인한 직접 출처 URL이 없습니다",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.requests).toHaveLength(1);
  });

  /**
   * 2026-09-04 실측: 이 거부 경로만 diagnostic 인자를 안 넘겨서 진단이
   * 비어 있었다(undefined). 저장된 실제 데이터에서 이 사유로 막힌 사례는
   * 못 찾았지만(0건), todo.txt 가 말한 "approvalSourcePreflightDiagnostic
   * 이 {} 다"는 다른 원인(저장 경로를 잘못 조회함)이었지 이 문제는 아니었다 —
   * 그래도 이 한 경로는 실제로 비어 있었으므로 채운다.
   */
  it("attaches a diagnostic when no discovered candidate matches an observed web-search source", async () => {
    const provider = new QueueProvider([preflightResponse({
      observedUrls: [
        "https://www.gov.kr/portal/service/serviceInfo/different",
      ],
    })]);
    vi.stubGlobal("fetch", vi.fn());

    let caught: unknown;
    try {
      await new AIWorkflow(provider, strategy).generate(generationInput());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApprovalSourcePreflightError);
    const error = caught as ApprovalSourcePreflightError;
    expect(error.diagnostic).toBeDefined();
    expect(error.diagnostic?.rejectionStage).toBe("source");
    expect(error.diagnostic?.rejectionCode).toBe("discovery_sources_not_observed");
  });

  it("blocks before Generation when a required Claim field is missing", async () => {
    const provider = new QueueProvider([preflightResponse({
      sources: [source({ claims: [] })],
    })]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      pageHtml(),
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    )));

    await expect(
      new AIWorkflow(provider, strategy).generate(generationInput()),
    ).rejects.toThrow("미확보 Claim: eligibility");
    expect(provider.requests).toHaveLength(1);
  });

  it("blocks manuscript Generation when a relevant official source has only paraphrased source evidence", async () => {
    const provider = new QueueProvider([preflightResponse({
      sources: [source({
        sourceExcerpt: "A paraphrase of the official page that does not occur in the page.",
        claims: [{
          field: "eligibility",
          value: eligibilityValue,
          evidenceExcerpt: eligibilityEvidenceExcerpt,
        }],
      })],
    })]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      pageHtml(),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    await expect(
      new AIWorkflow(provider, strategy).generate(generationInput()),
    ).rejects.toThrow();
    expect(provider.requests).toHaveLength(1);
  });

  it("does not pass required Claim Coverage when a response omits claims", async () => {
    const response = preflightResponse();
    const provider = new QueueProvider([{
      ...response,
      content: JSON.stringify({
        sources: [{
          url: sourceUrl,
          title: "정부24 공식 안내",
          evidenceExcerpt: sourceEvidenceExcerpt,
        }],
      }),
    }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      pageHtml(),
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    )));

    await expect(
      new AIWorkflow(provider, strategy).generate(generationInput()),
    ).rejects.toThrow("미확보 Claim: eligibility");
    expect(provider.requests).toHaveLength(1);
  });

  it("blocks before Generation when Claim value or excerpt is missing", async () => {
    for (const claims of [
      [{
        field: "eligibility",
        value: "",
        evidenceExcerpt: eligibilityEvidenceExcerpt,
      }],
      [{
        field: "eligibility",
        value: eligibilityValue,
        evidenceExcerpt: "",
      }],
    ]) {
      const provider = new QueueProvider([preflightResponse({
        sources: [source({ claims })],
      })]);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(
        pageHtml(),
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      )));

      await expect(
        new AIWorkflow(provider, strategy).generate(generationInput()),
      ).rejects.toThrow("미확보 Claim: eligibility");
      expect(provider.requests).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it("blocks fabricated Claim value and fabricated excerpt", async () => {
    const invalidClaims = [
      [{
        field: "eligibility",
        value: "공식 안내의 허위 지원 대상",
        evidenceExcerpt: eligibilityEvidenceExcerpt,
      }],
      [{
        field: "eligibility",
        value: eligibilityValue,
        evidenceExcerpt: "페이지에 존재하지 않는 가짜 근거 문구입니다.",
      }],
    ];

    for (const claims of invalidClaims) {
      const provider = new QueueProvider([preflightResponse({
        sources: [source({ claims })],
      })]);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(
        pageHtml(),
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      )));

      await expect(
        new AIWorkflow(provider, strategy).generate(generationInput()),
      ).rejects.toThrow("미확보 Claim: eligibility");
      expect(provider.requests).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  /**
   * The excerpt is the model's quote of the page it read; the page text is this
   * server's separate extraction of the same URL. The two can differ inside the
   * quote without the evidence being any less present, which is how a 국세청 page
   * carrying the required wording verbatim was rejected.
   */
  it("accepts a quote the page carries despite an extraction difference inside it", async () => {
    const extractedVariant =
      "공식 안내의 지원 대상과 신청 조건(변경 시 공고)을 신청 전에 확인해야 합니다.";
    const provider = new QueueProvider([preflightResponse(), generationResponse()]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      pageHtml({ claimExcerpt: extractedVariant }),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    await expect(new AIWorkflow(provider, strategy).generate(generationInput()))
      .resolves.toBeDefined();
  });

  it("still blocks a quote the page does not carry, however it is worded", async () => {
    const unrelated =
      "공식 안내는 신청자의 거주 기간과 차량 보유 여부를 기준으로 판단한다고 적혀 있습니다.";
    const provider = new QueueProvider([preflightResponse({
      sources: [source({
        claims: [{
          field: "eligibility",
          value: eligibilityValue,
          evidenceExcerpt: unrelated,
        }],
      })],
    })]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      pageHtml(),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    await expect(new AIWorkflow(provider, strategy).generate(generationInput()))
      .rejects.toThrow("미확보 Claim: eligibility");
  });

  it("uses the redirect final URL after validating the final page", async () => {
    const finalUrl =
      "https://www.gov.kr/portal/service/serviceInfo/test-current";
    const provider = new QueueProvider([
      preflightResponse(),
      generationResponse(),
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === sourceUrl) {
        return new Response(null, {
          status: 302,
          headers: { location: finalUrl },
        });
      }
      return new Response(pageHtml(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AIWorkflow(provider, strategy)
      .generate(generationInput());

    expect(provider.requests).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.document.metadata?.approvalEvidence?.sources[0]?.url)
      .toBe(finalUrl);
  });

  it("combines several unseen pages and calls Generation once after full Coverage", async () => {
    const input = generationInput({
      expectedCoverage: [
        "지원 대상: 만 19세 이상 거주자",
        "지원 금액: 100만원",
      ],
      searchIntent: "공식 지원 대상과 지원 금액 확인",
      readerProblem: "지원 대상과 금액을 판단하기 어려움",
    });
    const firstSourceExcerpt =
      "지원 대상은 만 19세 이상 거주자라는 공식 신청 안내입니다.";
    const firstClaimExcerpt = "지원 대상은 만 19세 이상 거주자입니다.";
    const secondSourceExcerpt =
      "지원 금액은 가구당 100만원이라는 공식 지급 안내입니다.";
    const secondClaimExcerpt = "지원 금액은 가구당 100만원입니다.";
    const provider = new QueueProvider([
      preflightResponse({
        sources: [
          source({
            sourceExcerpt: firstSourceExcerpt,
            claims: [{
              field: "eligibility",
              value: "만 19세 이상 거주자",
              evidenceExcerpt: firstClaimExcerpt,
            }],
          }),
          source({
            url: secondSourceUrl,
            sourceExcerpt: secondSourceExcerpt,
            claims: [{
              field: "amount",
              value: "100만원",
              evidenceExcerpt: secondClaimExcerpt,
            }],
          }),
        ],
      }),
      generationResponse(),
    ]);
    vi.stubGlobal("fetch", vi.fn(async (requested: string | URL | Request) => {
      const url = String(requested);
      return new Response(
        url === secondSourceUrl
          ? pageHtml({
              sourceExcerpt: secondSourceExcerpt,
              claimExcerpt: secondClaimExcerpt,
            })
          : pageHtml({
              sourceExcerpt: firstSourceExcerpt,
              claimExcerpt: firstClaimExcerpt,
            }),
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }));

    const result = await new AIWorkflow(provider, strategy).generate(input);

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]?.metadata?.task).toBe(
      "approval-source-preflight",
    );
    expect(provider.requests[1]?.metadata?.task).toBe("content-generation");
    expect(result.document.metadata?.approvalEvidence?.sources).toHaveLength(2);
    expect(result.document.metadata?.approvalEvidence?.sources
      .flatMap((item) => item.facts.map((fact) => fact.field)))
      .toEqual(["eligibility", "amount"]);
  });
});
