import { describe, expect, it } from "vitest";

import { type AIProvider, type AIRequest, type AIResponse, type ContentGenerationStrategy, type GenerationInput } from "../../../../core/ai";
import { AIWorkflow } from "../../../../core/ai/AIWorkflow";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
  longFormNarrativeFloors,
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
    sourceRequest: "국민연금 예상수령액 조회 방법",
    selectionMode: "userSpecified",
    selectedTopic: "국민연금 예상수령액 조회 방법",
    primaryKeyword: "국민연금 예상수령액 조회 방법",
    secondaryKeywords: ["국민연금 가입기간 확인"],
    searchIntent: "조회 결과 해석 기준",
    audience: "국민연금 가입자",
    contentType: "article",
    contentAngle: "결과 해석",
    readerProblem: "표시된 금액이 확정인지 판단하기 어렵다",
    expectedCoverage: ["조회 절차", "결과 해석"],
    selectionRationale: "실용 정보",
    opportunityEvidence: [],
    confidence: 0.8,
    cautions: [],
    projectId: "p",
    verificationPlan: createContentOpportunityVerificationPlan([]),
  });
  return confirmContentOpportunity(candidate, { workspaceId: "w", projectId: "p", contentId: "c", confirmedAt: "2026-08-13T00:00:00.000Z" });
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the article." }),
  parse: () => ({
    id: "c",
    title: "국민연금 예상수령액 조회 방법",
    blocks: [{ id: "p-advice", type: "paragraph" as const, text: "조회 결과와 기록을 함께 확인하세요." }],
    metadata: {
      buttonCount: 0, createdAt: "2026-08-13T00:00:00.000Z", generator: "test", imageCount: 0, language: "ko",
      readingTime: 1, source: "test", updatedAt: "2026-08-13T00:00:00.000Z", version: 1, videoCount: 0, wordCount: 20,
    },
  } satisfies ContentDocument),
};

function approvalInput(): GenerationInput {
  return {
    contentId: "c",
    contentType: "article" as never,
    contentOpportunity: opportunity(),
    editorialContext: approvalPolicyPromptContext(resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!),
    keywords: ["국민연금 예상수령액 조회 방법"],
    platform: "wordpress" as never,
    projectId: "p",
    structuredLongFormOutput: true,
  };
}

/**
 * content-msrfq4gt-fc8ub1 cleared every prose floor as generated and was then
 * blocked on two CONTENT_SECTION_PROSE_INSUFFICIENT sections, because the
 * factual inventory deleted four whole paragraphs whose fault was an unreported
 * 정보 기준일 date or 법령 reference. One of them was the prose explaining the
 * comparison table. The writer cannot make the server verify a fact, so it is
 * told to keep a withdrawable fact out of the paragraph that explains a
 * section.
 */
describe("AIWorkflow withdrawal-resilient paragraph contract", () => {
  it("tells approval Generation to keep a withdrawable fact out of the explaining paragraph", async () => {
    const provider = new RecordingProvider();
    await new AIWorkflow(provider, strategy).generate(approvalInput());

    const instruction = provider.requests[0]!.instruction;
    expect(instruction).toContain("Withdrawal-resilient paragraph contract");
    expect(instruction).toContain("deletes the entire paragraph carrying a factual surface it cannot verify");
    expect(instruction).toContain("counting only the paragraphs that carry no verifiable fact");
  });

  it("quotes the floors the gate actually measures instead of a retyped number", async () => {
    const provider = new RecordingProvider();
    await new AIWorkflow(provider, strategy).generate(approvalInput());

    const instruction = provider.requests[0]!.instruction;
    expect(instruction).toContain(`${longFormNarrativeFloors.standard} characters excluding whitespace`);
    expect(instruction).toContain(`or ${longFormNarrativeFloors.listShaped} when its sectionType is checklist, steps, faq`);
  });

  it("leaves content without the factual inventory alone", async () => {
    const provider = new RecordingProvider();
    const input = approvalInput();
    await new AIWorkflow(provider, strategy).generate({ ...input, editorialContext: undefined });

    expect(provider.requests[0]!.instruction).not.toContain("Withdrawal-resilient paragraph contract");
  });
});
