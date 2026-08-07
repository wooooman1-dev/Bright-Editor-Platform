import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../core/ai/ApprovalSourcePreflight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../core/ai/ApprovalSourcePreflight")>();
  return {
    ...actual,
    runApprovalSourcePreflight: vi.fn(),
  };
});

import type { AIProvider, AIRequest } from "../../../../core/ai";
import {
  AIWorkflow,
  type ContentGenerationStrategy,
  type GenerationInput,
} from "../../../../core/ai/AIWorkflow";
import {
  runApprovalSourcePreflight,
  type ApprovalSourcePreflightResult,
} from "../../../../core/ai/ApprovalSourcePreflight";
import {
  approvalPolicyPromptContext,
  createVerificationSnapshot,
  resolveApprovalPolicySnapshot,
  type VerificationClaimSpec,
  type VerificationSourceAssessment,
} from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
} from "../../../../core/content";
import { editorialRevisionId } from "../../../../core/quality";

const claim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-amount",
  field: "amount",
  kind: "money",
  statement: "현재 지원 금액은 50만원이다.",
  rawValue: "50만원",
  qualifiers: Object.freeze({}),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});
const plan = createContentOpportunityVerificationPlan([claim]);
const normalizedValue = Object.freeze({
  kind: "money" as const,
  value: Object.freeze({ amount: 500_000, currency: "KRW", basis: "total" as const }),
});

function assessment(sourceId: string, role: VerificationSourceAssessment["role"]): VerificationSourceAssessment {
  return Object.freeze({
    sourceId,
    institutionGroupId: `institution-${sourceId}`,
    canonicalUrl: `https://${sourceId}.example/claim`,
    role,
    authoritative: true,
    supports: true,
    normalizedValue,
    freshnessStatus: "fresh" as const,
    fresh: true,
    diagnostics: Object.freeze([`claim:${claim.claimId}`]),
  });
}

const assessments = Object.freeze([
  assessment("primary", "primaryOfficial"),
  assessment("official-a", "officialCorroborating"),
  assessment("official-b", "officialCorroborating"),
]);
const snapshot = createVerificationSnapshot({
  plan,
  assessments,
  results: [{
    claimId: claim.claimId,
    normalizedValue,
    sourceAssessments: assessments,
    unresolvedConflict: false,
    freshnessPassed: true,
    diagnostics: [],
  }],
});

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "지원 금액 확인 방법을 설명해줘",
  selectionMode: "userSpecified",
  selectedTopic: "지원 금액 확인 방법",
  primaryKeyword: "지원 금액 확인 방법",
  secondaryKeywords: ["공식 지원금 확인"],
  searchIntent: "현재 지원 금액과 공식 확인 경로 파악",
  audience: "공식 지원금 정보를 확인하려는 독자",
  contentType: "article",
  contentAngle: "공식 근거를 기준으로 금액 확인",
  readerProblem: "현재 적용되는 지원 금액을 확인하기 어려움",
  expectedCoverage: ["지원 금액", "공식 확인 경로"],
  selectionRationale: "사용자 지정 주제",
  opportunityEvidence: [{ source: "unknown", summary: "사전 시장 데이터 없음" }],
  confidence: 0.8,
  cautions: [],
  projectId: "project-1",
  verificationPlan: plan,
}), {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  confirmedAt: "2026-08-08T00:00:00.000Z",
});

const editorialContext = approvalPolicyPromptContext(
  resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
);

const input: GenerationInput = {
  contentId: "content-1",
  contentType: "article" as GenerationInput["contentType"],
  contentOpportunity: opportunity,
  editorialContext,
  keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
  platform: "wordpress" as GenerationInput["platform"],
  projectId: "project-1",
  structuredLongFormOutput: true,
};

class RecordingProvider implements AIProvider {
  calls = 0;
  request?: AIRequest;

  async generate(request: AIRequest) {
    this.calls += 1;
    this.request = request;
    return { content: "generated", model: "test" };
  }
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the article." }),
  parse: () => ({
    id: "content-1",
    title: "지원 금액 확인 방법",
    blocks: Object.freeze([
      Object.freeze({ id: "p1", type: "paragraph" as const, text: "현재 지원 금액은 50만원입니다." }),
    ]),
    metadata: Object.freeze({
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
      wordCount: 5,
    }),
  }),
};

const preflight: ApprovalSourcePreflightResult = Object.freeze({
  sources: Object.freeze([
    { url: "https://primary.example/claim", title: "primary", excerpt: "verified", provenance: "citation" as const },
    { url: "https://official-a.example/claim", title: "official-a", excerpt: "verified", provenance: "citation" as const },
    { url: "https://official-b.example/claim", title: "official-b", excerpt: "verified", provenance: "citation" as const },
  ]),
  claimSources: Object.freeze([
    { url: "https://primary.example/claim", claims: Object.freeze([{ field: "amount", value: "50만원", evidenceExcerpt: "지원 금액은 50만원입니다." }]) },
    { url: "https://official-a.example/claim", claims: Object.freeze([{ field: "amount", value: "50만원", evidenceExcerpt: "지원 금액은 50만원입니다." }]) },
    { url: "https://official-b.example/claim", claims: Object.freeze([{ field: "amount", value: "50만원", evidenceExcerpt: "지원 금액은 50만원입니다." }]) },
  ]),
  coverage: Object.freeze({
    status: "not_required" as const,
    requiredClaims: Object.freeze([]),
    coveredClaimFields: Object.freeze([]),
    uncoveredClaimFields: Object.freeze([]),
    sources: Object.freeze([]),
  }),
  verificationSnapshot: snapshot,
});

describe("AIWorkflow Generated Claim binding", () => {
  beforeEach(() => {
    vi.mocked(runApprovalSourcePreflight).mockReset();
    vi.mocked(runApprovalSourcePreflight).mockResolvedValue(preflight);
  });

  it("persists the server-owned Snapshot and verified Claim bindings in canonical metadata", async () => {
    const provider = new RecordingProvider();
    const result = await new AIWorkflow(provider, strategy).generate(input);

    expect(provider.calls).toBe(1);
    expect(result.generatedClaimBindings).toContainEqual({
      location: { kind: "block", blockId: "p1" },
      matchedText: "50만원",
      reference: {
        referenceType: "verified",
        verificationClaimId: claim.claimId,
        sourceIds: ["primary", "official-a", "official-b"],
      },
    });
    expect(result.verificationSnapshot?.verificationSnapshotFingerprint).toBe(snapshot.verificationSnapshotFingerprint);
    expect(result.document.metadata?.generatedClaimVerification).toMatchObject({
      schemaVersion: 1,
      boundEditorialRevisionId: editorialRevisionId(result.document),
      verifiedClaimIds: [claim.claimId],
      unverifiedDetectedCount: 0,
    });
    expect(result.document.metadata?.generatedClaimVerification?.verificationSnapshot.verificationSnapshotFingerprint).toBe(snapshot.verificationSnapshotFingerprint);
    expect(result.document.metadata?.generatedClaimVerification?.bindings).toEqual(result.generatedClaimBindings);
  });
});
