import { describe, expect, it, vi } from "vitest";

import { type AIProvider, type AIRequest, type AIResponse, type AIWebSource, type ContentGenerationStrategy, type GenerationInput } from "../../../../core/ai";
import { AIWorkflow } from "../../../../core/ai/AIWorkflow";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import { confirmContentOpportunity, createContentOpportunityCandidate, createContentOpportunityVerificationPlan, type ContentDocument } from "../../../../core/content";

const verifySurface = "취소 처리와 카드사 청구 반영은 서로 다른 단계일 수 있습니다.";
const evidenceExcerpt = "카드 결제 취소 처리와 카드사 청구 반영은 서로 다른 단계일 수 있습니다.";
const evidenceUrl = "https://www.fss.or.kr/card/cancel";

class OneCallProvider implements AIProvider {
  readonly requests: AIRequest[] = [];
  constructor(private readonly response: AIResponse) {}
  async generate(request: AIRequest): Promise<AIResponse> {
    this.requests.push(request);
    if (this.requests.length > 1) throw new Error("Unexpected extra provider call.");
    return this.response;
  }
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
  return confirmContentOpportunity(candidate, { workspaceId: "w", projectId: "p", contentId: "c", confirmedAt: "2026-08-09T00:00:00.000Z" });
}

function response(inventory: readonly Record<string, unknown>[], webSources: readonly AIWebSource[] = []): AIResponse {
  return {
    content: JSON.stringify({ verificationClaimsUsed: inventory }),
    model: "test-model",
    diagnostics: { stage: "generation", webSearchCalls: webSources.length ? 1 : 0, webSources },
  };
}

function inventory(risk: "verify" | "critical" = "verify") {
  return {
    claimId: risk === "verify" ? "claim-verify" : "claim-critical-new",
    planningClaimId: "",
    origin: "generation",
    risk,
    surfaceText: risk === "verify" ? verifySurface : "이 상품의 실제 금리는 7%입니다.",
    statement: risk === "verify" ? verifySurface : "이 상품의 실제 금리는 7%입니다.",
    kind: risk === "verify" ? "general" : "ratio",
    normalizedValueJson: "{}",
    qualifiers: { subject: "", scope: "", basis: "", note: "" },
    temporalRequirementJson: "null",
    evidenceUrl: risk === "verify" ? evidenceUrl : "",
    evidenceExcerpt: risk === "verify" ? evidenceExcerpt : "",
  };
}

function strategy(surface?: string): ContentGenerationStrategy {
  return {
    createRequest: () => ({ instruction: "Write the article." }),
    parse: () => ({
      id: "c", title: "카드 명세서 확인 방법",
      blocks: [
        ...(surface ? [{ id: "p-fact", type: "paragraph" as const, text: surface }] : []),
        { id: "p-advice", type: "paragraph" as const, text: "영수증과 비교하세요." },
      ],
      metadata: { buttonCount: 0, createdAt: "2026-08-09T00:00:00.000Z", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "2026-08-09T00:00:00.000Z", version: 1, videoCount: 0, wordCount: 20 },
    } satisfies ContentDocument),
  };
}

function input(): GenerationInput {
  return {
    contentId: "c", contentType: "article" as never, contentOpportunity: opportunity(),
    editorialContext: approvalPolicyPromptContext(resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!),
    keywords: ["카드 명세서 확인 방법"], platform: "wordpress" as never, projectId: "p", structuredLongFormOutput: true,
  };
}

describe("AIWorkflow VERIFY lifecycle", () => {
  it("keeps a same-call verified new VERIFY with one Generation provider call", async () => {
    const provider = new OneCallProvider(response([inventory()], [{ url: evidenceUrl, title: "카드 결제 취소 안내", excerpt: evidenceExcerpt, provenance: "citation" }]));
    const fetcher = vi.fn(async () => new Response(`<html><head><title>카드 결제 취소 안내</title></head><body><main><p>${evidenceExcerpt}</p><p>카드 명세서 취소 처리와 청구 반영 상태를 확인합니다.</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html" } }));
    const result = await new AIWorkflow(provider, strategy(verifySurface), { verifyEvidenceFetcher: fetcher }).generate(input());
    expect(provider.requests).toHaveLength(1);
    expect(result.document.metadata?.generatedFactualClaimInventory?.retainedClaimIds).toEqual(["claim-verify"]);
    expect(JSON.stringify(result.document.blocks)).toContain(verifySurface);
  });

  // D-039: an unsupported VERIFY is reported, not cut out of the manuscript.
  it("reports unsupported VERIFY without editing the manuscript or adding a provider call", async () => {
    const provider = new OneCallProvider(response([inventory()]));
    const result = await new AIWorkflow(provider, strategy(verifySurface), { verifyEvidenceFetcher: vi.fn() }).generate(input());
    expect(provider.requests).toHaveLength(1);
    expect(result.document.metadata?.generatedFactualClaimInventory?.removedClaimCount).toBe(1);
    expect(result.document.metadata?.generatedFactualClaimInventory?.retainedClaimIds).toEqual([]);
    expect(JSON.stringify(result.document.blocks)).toContain(verifySurface);
    expect(JSON.stringify(result.document.blocks)).toContain("영수증과 비교하세요");
  });

  it("keeps NONE-only content at zero web/fetch cost and reports a new unplanned CRITICAL", async () => {
    const noneProvider = new OneCallProvider(response([]));
    const fetcher = vi.fn();
    const none = await new AIWorkflow(noneProvider, strategy(), { verifyEvidenceFetcher: fetcher }).generate(input());
    expect(noneProvider.requests).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(none.document.metadata?.generatedFactualClaimInventory?.items).toEqual([]);

    const criticalProvider = new OneCallProvider(response([inventory("critical")]));
    const critical = await new AIWorkflow(criticalProvider, strategy("이 상품의 실제 금리는 7%입니다."), { verifyEvidenceFetcher: fetcher }).generate(input());
    expect(criticalProvider.requests).toHaveLength(1);
    const criticalItems = critical.document.metadata?.generatedFactualClaimInventory?.items ?? [];
    expect(criticalItems.filter((item) => item.risk === "critical" && item.disposition === "removed"))
      .not.toHaveLength(0);
    expect(JSON.stringify(critical.document.blocks)).toContain("7%");
  });
});
