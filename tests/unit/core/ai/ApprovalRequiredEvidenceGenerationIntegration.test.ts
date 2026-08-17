import { afterEach, describe, expect, it, vi } from "vitest";

import { AIWorkflow } from "../../../../core/ai/AIWorkflow";
import type { AIProvider, AIResponse, ContentGenerationStrategy } from "../../../../core/ai";
import {
  createApprovalRequiredEvidenceContract,
  approvalPolicyPromptContext,
  resolveApprovalPolicySnapshot,
} from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
} from "../../../../core/content";
import {
  attachApprovalEvidenceContracts,
  createManualPlanningResult,
} from "../../../../app/application/ContentPlanningStrategy";

const snapshot = resolveApprovalPolicySnapshot(
  "adsense_approval",
  "wordpress_life_economy_v1",
)!;
const sourceUrl = "https://www.gov.kr/portal/service/serviceInfo/test";
const claimValue = "정부지원금 신청 자격과 100만원 지원 금액 안내";

class QueueProvider implements AIProvider {
  readonly requests: Array<{ metadata?: Readonly<Record<string, string>> }> = [];

  constructor(private readonly responses: readonly AIResponse[]) {}

  async generate(request: { metadata?: Readonly<Record<string, string>> }): Promise<AIResponse> {
    this.requests.push(request);
    const response = this.responses[this.requests.length - 1];
    if (!response) throw new Error("Unexpected provider call.");
    return response;
  }
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the complete article." }),
  parse: () => ({
    id: "content-synthetic",
    title: "신용점수 관리 방법",
    blocks: [{ id: "p1", type: "paragraph", text: "공식 신용점수 관리 안내를 바탕으로 설명합니다." }],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: "2026-08-08T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 8,
    },
  }),
};

function opportunity() {
  const planning = createManualPlanningResult("신용점수 관리 방법", {
    projectId: "project-synthetic",
    selectionMode: "userSpecified",
  });
  const contracted = attachApprovalEvidenceContracts(planning, snapshot).opportunityCandidates![0]!;
  return confirmContentOpportunity(contracted, {
    workspaceId: "workspace-synthetic",
    projectId: "project-synthetic",
    contentId: "content-synthetic",
    confirmedAt: "2026-08-08T00:00:00.000Z",
  });
}

function structuredOpportunity() {
  const base = attachApprovalEvidenceContracts(
    createManualPlanningResult("정부지원금 신청 자격 확인", {
      projectId: "project-synthetic",
      selectionMode: "userSpecified",
    }),
    snapshot,
  ).opportunityCandidates![0]!;
  const contract = Object.freeze({
    ...createApprovalRequiredEvidenceContract(base, snapshot),
    contractId: "contract-synthetic-eligibility",
    requiredClaims: Object.freeze([{ field: "amount", plannedValue: "100만원" }]),
  });
  const candidate = createContentOpportunityCandidate({
    ...base,
    requiredEvidenceContract: contract,
  });
  return confirmContentOpportunity(candidate, {
    workspaceId: "workspace-synthetic",
    projectId: "project-synthetic",
    contentId: "content-synthetic",
    confirmedAt: "2026-08-08T00:00:00.000Z",
  });
}

function preflightResponse(): AIResponse {
  return {
    content: JSON.stringify({
      sources: [{
        url: sourceUrl,
        title: "공식 안내",
        evidenceExcerpt: claimValue,
        claims: [{
          claimId: "amount",
          field: "amount",
          value: claimValue,
          evidenceExcerpt: claimValue,
        }],
      }],
    }),
    model: "test",
    diagnostics: {
      webSources: [{ url: sourceUrl, title: "공식 안내", provenance: "search_candidate" }],
    },
  };
}

function generationResponse(): AIResponse {
  return { content: JSON.stringify({ verificationClaimsUsed: [] }), model: "test" };
}

function input(selected = opportunity()) {
  return {
    contentId: selected.contentId,
    contentType: selected.contentType as never,
    contentOpportunity: selected,
    editorialContext: approvalPolicyPromptContext(snapshot),
    keywords: [selected.primaryKeyword],
    platform: "wordpress" as never,
    projectId: selected.projectId,
    structuredLongFormOutput: true,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.skip("Legacy Claim-first approval evidence contract (replaced by Official Source First)", () => {
  it("treats a Claim-free Planning contract as Evidence N/A", async () => {
    const selected = opportunity();
    expect(selected.requiredEvidenceContract).toMatchObject({
      profileSourceRequirementApplicable: false,
      explicitVerificationRequired: false,
      requiredClaims: [],
    });

    const provider = new QueueProvider([generationResponse()]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    await expect(new AIWorkflow(provider, strategy).generate(input())).resolves.toBeDefined();
    expect(provider.requests).toHaveLength(1);
  });

  it("consumes the same Planning contract and stores verified preflight coverage before Generation", async () => {
    const provider = new QueueProvider([preflightResponse(), generationResponse()]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      `<html><head><title>공식 안내</title></head><body>${claimValue.repeat(40)}</body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )));

    const selected = structuredOpportunity();
    expect(selected.requiredEvidenceContract).toMatchObject({
      contractId: "contract-synthetic-eligibility",
      requiredClaims: [{ field: "amount", plannedValue: "100만원" }],
    });
    const result = await new AIWorkflow(provider, strategy).generate(input(selected));

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.metadata?.task).toBe("content-generation");
    expect(result.document.metadata?.approvalEvidence).toMatchObject({
      status: "verified",
      reviewedAt: expect.any(String),
      coverageStatus: "verified",
      requiredFactFields: ["amount"],
      verifiedFactFields: ["amount"],
      unverifiedFactFields: [],
      sourcePolicyCompliance: "passed",
    });
    expect(result.document.metadata?.approvalEvidence?.sources[0]).toMatchObject({
      provenance: "system_verified",
      verified: true,
      cited: true,
      selected: true,
      verificationStatus: "verified",
    });
    expect(provider.requests[1]?.metadata?.approvalEvidenceMode).toBe("preflight_verified");
  });
});
