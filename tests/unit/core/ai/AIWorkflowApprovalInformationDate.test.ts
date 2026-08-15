import { describe, expect, it } from "vitest";

import { type AIProvider, type AIRequest, type AIResponse, type ContentGenerationStrategy, type GenerationInput } from "../../../../core/ai";
import { AIWorkflow } from "../../../../core/ai/AIWorkflow";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
  type ContentDocument,
} from "../../../../core/content";

class RecordingProvider implements AIProvider {
  readonly requests: AIRequest[] = [];
  async generate(request: AIRequest): Promise<AIResponse> {
    this.requests.push(request);
    return { content: JSON.stringify({ verificationClaimsUsed: [] }), model: "test-model" };
  }
}

function opportunity() {
  const candidate = createContentOpportunityCandidate({
    sourceRequest: "국세환급금 조회 방법",
    selectionMode: "userSpecified",
    selectedTopic: "국세환급금 조회 방법",
    primaryKeyword: "국세환급금 조회 방법",
    secondaryKeywords: ["국세 환급금 확인"],
    searchIntent: "조회 결과 해석 기준",
    audience: "환급금을 확인하려는 납세자",
    contentType: "article",
    contentAngle: "결과 해석",
    readerProblem: "조회 결과가 수령 확정인지 판단하기 어렵다",
    expectedCoverage: ["조회 절차", "결과 해석"],
    selectionRationale: "실용 정보",
    opportunityEvidence: [],
    confidence: 0.8,
    cautions: [],
    projectId: "p",
    verificationPlan: createContentOpportunityVerificationPlan([]),
  });
  return confirmContentOpportunity(candidate, { workspaceId: "w", projectId: "p", contentId: "c", confirmedAt: "2026-08-14T00:00:00.000Z" });
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the article." }),
  parse: () => ({
    id: "c",
    title: "국세환급금 조회 방법",
    blocks: [{ id: "p-advice", type: "paragraph" as const, text: "조회 결과와 상태 값을 함께 확인하세요." }],
    metadata: {
      buttonCount: 0, createdAt: "2026-08-14T00:00:00.000Z", generator: "test", imageCount: 0, language: "ko",
      readingTime: 1, source: "test", updatedAt: "2026-08-14T00:00:00.000Z", version: 1, videoCount: 0, wordCount: 20,
    },
  } satisfies ContentDocument),
};

function approvalInput(): GenerationInput {
  return {
    contentId: "c",
    contentType: "article" as never,
    contentOpportunity: opportunity(),
    editorialContext: approvalPolicyPromptContext(resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!),
    keywords: ["국세환급금 조회 방법"],
    platform: "wordpress" as never,
    projectId: "p",
    structuredLongFormOutput: true,
  };
}

/**
 * content-mssph0q6-ftn4h7 was blocked on PROFILE_REVIEW_DATE_MISSING with no
 * 정보 기준일 anywhere in its 38 blocks. The approval content policy requires the
 * line in the body and Evidence selection harvests it from there, but the
 * generation prompt only restricted how to write the date if it appeared — it
 * never asked for it.
 */
describe("AIWorkflow approval information-date contract", () => {
  it("requires the approval manuscript to state a server-supplied 정보 기준일", async () => {
    const provider = new RecordingProvider();
    await new AIWorkflow(provider, strategy).generate(approvalInput());

    const instruction = provider.requests[0]!.instruction;
    expect(instruction).toContain("Information-date contract (mandatory for approval preparation)");
    expect(instruction).toContain(`"정보 기준일: ${new Date().toISOString().slice(0, 10)}"`);
    expect(instruction).toContain("The server supplies this date, so do not guess another one");
    expect(instruction).toContain('heading "정보 기준과 다시 확인할 곳"');
    expect(instruction).toContain("Do not place this date under the title");
    expect(instruction).toContain("This paragraph is reader guidance, not source content");
  });

  it("keeps the system-owned review dates out of the manuscript and invents no source", async () => {
    const provider = new RecordingProvider();
    await new AIWorkflow(provider, strategy).generate(approvalInput());

    const instruction = provider.requests[0]!.instruction;
    expect(instruction).toContain("Never write 출처 확인일 or 최종 검토일");
    expect(instruction).toContain("using only a service or page present in the supplied Evidence, without writing a URL");
    expect(instruction).toContain("Do not report the 정보 기준일 line as a factual Claim");
  });

  it("leaves content without an approval policy alone", async () => {
    const provider = new RecordingProvider();
    await new AIWorkflow(provider, strategy).generate({ ...approvalInput(), editorialContext: undefined });

    expect(provider.requests[0]!.instruction).not.toContain("Information-date contract");
  });
});
