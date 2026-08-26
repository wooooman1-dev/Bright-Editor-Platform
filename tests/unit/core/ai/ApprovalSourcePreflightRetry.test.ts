import { describe, expect, it } from "vitest";

import { runApprovalSourcePreflight } from "../../../../core/ai/ApprovalSourcePreflight";
import {
  createAIUsageRecord,
  type AIProvider,
  type AIRequest,
  type AIResponse,
} from "../../../../core/ai";
import { createApprovalRequiredEvidenceContract, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
} from "../../../../core/content";

const imagePageUrl = "https://www.gov.kr/portal/service/serviceInfo/cardnews";
const textPageUrl = "https://www.gov.kr/portal/service/serviceInfo/guide";
const claimExcerpt = "휴면예금 온라인 조회 과정에서는 본인 확인 절차가 요구될 수 있습니다.";
const claimValue = "본인 확인 절차가 요구될 수 있습니다";

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

function opportunity(extraClaims: readonly Parameters<typeof createContentOpportunityVerificationPlan>[0][number][] = []) {
  const candidate = createContentOpportunityCandidate({
    sourceRequest: "휴면예금 조회 방법 글을 작성해줘",
    selectionMode: "userSpecified",
    selectedTopic: "휴면예금 조회 방법",
    primaryKeyword: "휴면예금 조회 방법",
    secondaryKeywords: ["휴면예금 찾기"],
    searchIntent: "휴면예금을 공식 서비스에서 조회하고 본인 확인 절차를 알고 싶다",
    audience: "오래된 예금을 확인하려는 일반 독자",
    contentType: "article",
    contentAngle: "공식 조회 경로와 본인 확인 절차",
    readerProblem: "어디서 어떻게 조회해야 하는지 모른다",
    expectedCoverage: [
      "지원 대상: 휴면예금 조회 대상과 본인 확인 조건",
      "신청 조건",
      "공식 재확인 경로",
    ],
    selectionRationale: "사용자가 지정한 주제",
    opportunityEvidence: [{ source: "unknown", summary: "생성 전 공식 출처 확인 필요" }],
    confidence: 0.7,
    cautions: [],
    projectId: "project-1",
    verificationPlan: createContentOpportunityVerificationPlan([{
      claimId: "dormant-identity-check",
      atomicity: "single_assertion",
      field: "휴면예금 조회의 본인 확인",
      kind: "eligibility",
      statement: "휴면예금 온라인 조회 과정에서는 본인 확인 절차가 요구될 수 있다.",
      qualifiers: {},
      temporalRequirement: { mode: "current" },
      required: true,
      risk: "critical",
    }, ...extraClaims]),
  });
  const confirmed = confirmContentOpportunity(candidate, {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    confirmedAt: "2026-08-12T00:00:00.000Z",
  });
  // The blocking throw only applies when the profile actually requires sources,
  // which is what the contract records.
  return Object.freeze({
    ...confirmed,
    requiredEvidenceContract: createApprovalRequiredEvidenceContract(candidate, snapshot()),
  });
}

function snapshot() {
  return resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
}

function discoveryResponse(url: string): AIResponse {
  return {
    content: JSON.stringify({
      sources: [{
        url,
        title: "휴면예금 조회 공식 안내",
        evidenceExcerpt: claimExcerpt,
        claims: [{
          claimId: "dormant-identity-check",
          field: "휴면예금 조회의 본인 확인",
          value: claimValue,
          evidenceExcerpt: claimExcerpt,
        }],
      }],
    }),
    model: "test-model",
    diagnostics: {
      webSources: [{ url, title: "휴면예금 조회 공식 안내", provenance: "search_candidate" as const }],
      aiUsage: createAIUsageRecord({
        stage: "source_preflight",
        task: "approval-source-preflight",
        model: "test-model",
        responseId: `response-${url}`,
        recordedAt: "2026-08-12T00:00:00.000Z",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        webSearchCalls: 1,
      }),
    },
  };
}



/** 웹 검색은 했지만 출처를 하나도 선언하지 않은 응답. */
function emptyDiscoveryResponse(): AIResponse {
  return {
    content: JSON.stringify({ sources: [] }),
    model: "test-model",
    diagnostics: {
      webSources: [
        { url: "https://example.com/a", title: "검색 결과 A", provenance: "search_candidate" as const },
        { url: "https://example.com/b", title: "검색 결과 B", provenance: "search_candidate" as const },
      ],
      aiUsage: createAIUsageRecord({
        stage: "source_preflight",
        task: "approval-source-preflight",
        model: "test-model",
        responseId: "response-empty",
        recordedAt: "2026-08-12T00:00:00.000Z",
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
        webSearchCalls: 4,
      }),
    },
  };
}

/**
 * Two required Claims, so a discovery response can support one and leave the
 * other with no source at all — the Coverage gap that names no rejected URL.
 */
function twoClaimOpportunity() {
  return opportunity([{
    claimId: "dormant-payout-request",
    atomicity: "single_assertion",
    field: "휴면예금 지급 청구",
    kind: "eligibility",
    statement: "휴면예금 조회 결과가 나오면 지급 청구 절차가 이어진다.",
    qualifiers: {},
    temporalRequirement: { mode: "current" },
    required: true,
    risk: "critical",
  }]);
}

/** Supports only the identity Claim, leaving the payout Claim uncovered. */

/** Supports both required Claims from the same readable page. */

function twoClaimPreflightInput(provider: AIProvider) {
  return { ...preflightInput(provider), opportunity: twoClaimOpportunity() };
}

/**
 * The card-news page stands in for a body whose text lives in images: it
 * fetches and extracts, so every earlier gate passes, but the quoted passage
 * is nowhere in the extracted text.
 */
function pageFor(url: string): string {
  const body = url === imagePageUrl
    ? "휴면예금 안내 카드뉴스입니다. 자세한 내용은 이미지에서 확인하세요. 홍보자료 목록으로 돌아가기."
    : `${claimExcerpt} 휴면예금 조회는 공식 서비스에서 본인 확인을 거쳐 진행합니다. 조회 결과에 따라 지급 청구 절차가 이어집니다.`;
  return `<html><head><title>휴면예금 조회 공식 안내</title></head><body>${body.repeat(8)}</body></html>`;
}

function fetcher() {
  return async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return new Response(pageFor(url.split("#")[0]), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
}

function preflightInput(provider: AIProvider) {
  return {
    provider,
    snapshot: snapshot(),
    opportunity: opportunity(),
    platform: "wordpress",
    contentType: "article",
    fetcher: fetcher() as unknown as typeof fetch,
  };
}

describe("Approval Source Preflight discovery retry", () => {
  it("asks discovery again with the rejected URL rather than blocking on one candidate", async () => {
    const provider = new QueueProvider([
      discoveryResponse(imagePageUrl),
      discoveryResponse(textPageUrl),
    ]);

    const result = await runApprovalSourcePreflight(preflightInput(provider));

    expect(provider.requests).toHaveLength(2);
    expect(result.sources.length).toBeGreaterThan(0);
    const retryInstruction = provider.requests[1]?.instruction ?? "";
    expect(retryInstruction).toContain(imagePageUrl);
    expect(retryInstruction).toContain("Do not submit these URLs again");
    expect(retryInstruction).toContain("evidence_anchor_unverified");
  });

  it("stops after the second attempt instead of retrying forever", async () => {
    const provider = new QueueProvider([
      discoveryResponse(imagePageUrl),
      discoveryResponse(imagePageUrl),
    ]);

    await expect(runApprovalSourcePreflight(preflightInput(provider))).rejects.toThrow();
    expect(provider.requests).toHaveLength(2);
  });

  /**
   * D-045: 커버리지가 생성을 막지 않으므로 커버리지 때문에 다시 검색하지도
   * 않는다. 재시도는 한 번의 Preflight 호출을 두 번으로 만들던 비용이었고,
   * 채워야 할 기준 자체가 없어졌다. 무엇이 비었는지는 결과의 coverage 로 남는다.
   */
  it("does not search again for a Claim left without a source", async () => {
    const provider = new QueueProvider([
      discoveryResponse(textPageUrl),
    ]);

    const result = await runApprovalSourcePreflight(twoClaimPreflightInput(provider));

    expect(provider.requests).toHaveLength(1);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.coverage?.status).toBe("incomplete");
  });

  /**
   * 제출이 0건이면 이름 붙일 URL도, missingClaimIds 도 없어 두 피드백 통로가
   * 동시에 비었고, 가장 흔한 실패 하나가 재시도에서 통째로 빠져 있었다.
   * 2026-08-26 실측: 통신비 미환급액 원고가 웹 검색 4회로 44건을 받고도
   * sources 를 하나도 선언하지 않은 채 1회 만에 막혔다.
   */
  it("asks discovery again when the first attempt declared no source at all", async () => {
    const provider = new QueueProvider([
      emptyDiscoveryResponse(),
      discoveryResponse(textPageUrl),
    ]);

    const result = await runApprovalSourcePreflight(preflightInput(provider));

    expect(provider.requests).toHaveLength(2);
    expect(result.sources.length).toBeGreaterThan(0);
    const retryInstruction = provider.requests[1]?.instruction ?? "";
    expect(retryInstruction).toContain("dormant-identity-check");
    expect(retryInstruction).toContain("submitted no source at all");
  });

  it("stops after the second empty declaration instead of retrying forever", async () => {
    const provider = new QueueProvider([
      emptyDiscoveryResponse(),
      emptyDiscoveryResponse(),
    ]);

    await expect(runApprovalSourcePreflight(preflightInput(provider))).rejects.toThrow();
    expect(provider.requests).toHaveLength(2);
  });

});
