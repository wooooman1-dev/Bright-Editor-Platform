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
  type ApprovalSourcePreflightClaimSource,
  type ApprovalSourcePreflightResult,
} from "../../../../core/ai/ApprovalSourcePreflight";
import {
  createVerificationSnapshot,
  type ExplicitVerificationInput,
} from "../../../../core/approval/ExplicitVerificationPreflight";
import type {
  VerificationClaimSpec,
  VerificationSourceAssessment,
} from "../../../../core/approval/VerificationClaim";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
} from "../../../../core/content";

const approvalContext = approvalPolicyPromptContext(
  resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
);

const claim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-amount",
  field: "amount",
  kind: "money",
  statement: "현재 지원 금액은 월 50만원이다.",
  rawValue: "월 50만원",
  qualifiers: Object.freeze({ basis: "monthly" }),
  temporalRequirement: { mode: "current" as const },
  required: true,
});

const plan = createContentOpportunityVerificationPlan([claim]);

function opportunity() {
  return confirmContentOpportunity(createContentOpportunityCandidate({
    sourceRequest: "지원 금액 확인 방법을 설명해줘",
    selectionMode: "userSpecified",
    selectedTopic: "지원 금액 확인 방법",
    primaryKeyword: "지원 금액 확인 방법",
    secondaryKeywords: ["공식 지원금 확인"],
    searchIntent: "현재 지원 금액과 확인 경로 파악",
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
}

const input: GenerationInput = {
  contentId: "content-1",
  contentType: "article" as GenerationInput["contentType"],
  contentOpportunity: opportunity(),
  editorialContext: approvalContext,
  keywords: ["지원 금액 확인 방법", "공식 지원금 확인"],
  platform: "wordpress" as GenerationInput["platform"],
  projectId: "project-1",
  structuredLongFormOutput: true,
};

const generationContent = JSON.stringify({
  verificationClaimsUsed: [{
    claimId: claim.claimId,
    surfaceText: "현재 지원 금액은 월 50만원입니다.",
    kind: claim.kind,
    normalizedValueJson: JSON.stringify({
      kind: "money",
      value: { amount: 500_000, currency: "KRW", basis: "monthly" },
    }),
    qualifiers: { subject: "", scope: "", basis: "monthly", note: "" },
    temporalRequirementJson: JSON.stringify(claim.temporalRequirement),
  }],
});

class RecordingProvider implements AIProvider {
  calls = 0;
  request?: AIRequest;

  async generate(request: AIRequest) {
    this.calls += 1;
    this.request = request;
    return { content: generationContent, model: "test" };
  }
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the article." }),
  parse: () => ({
    id: "content-1",
    title: "지원 금액 확인 방법",
    blocks: [
      {
        id: "p1",
        type: "paragraph" as const,
        text: "현재 지원 금액은 월 50만원입니다.",
      },
    ],
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
      wordCount: 6,
    },
  }),
};

function assessment(
  sourceId: string,
  url: string,
  freshnessStatus: VerificationSourceAssessment["freshnessStatus"] = "fresh",
): VerificationSourceAssessment {
  return Object.freeze({
    sourceId,
    institutionGroupId: sourceId,
    canonicalUrl: url,
    role: sourceId === "primary" ? "primaryOfficial" : "officialCorroborating",
    authoritative: true,
    supports: true,
    normalizedValue: {
      kind: "money" as const,
      value: { amount: 500_000, currency: "KRW", basis: "monthly" as const },
    },
    freshnessStatus,
    fresh: freshnessStatus === "fresh",
    diagnostics: Object.freeze([`claim:${claim.claimId}`]),
  });
}

function verifiedSnapshot() {
  const assessments = Object.freeze([
    assessment("primary", "https://primary.example/claim"),
    assessment("official-a", "https://official-a.example/claim"),
    assessment("official-b", "https://official-b.example/claim"),
    assessment("stale", "https://stale.example/claim", "stale"),
  ]);
  return createVerificationSnapshot({
    plan,
    assessments,
    results: [{
      claimId: claim.claimId,
      normalizedValue: {
        kind: "money",
        value: { amount: 500_000, currency: "KRW", basis: "monthly" },
      },
      sourceAssessments: assessments,
      unresolvedConflict: false,
      freshnessPassed: true,
      diagnostics: [],
    }],
  });
}

function insufficientSnapshot() {
  const snapshotInput: ExplicitVerificationInput = {
    plan,
    assessments: [],
    results: [{
      claimId: claim.claimId,
      sourceAssessments: [],
      unresolvedConflict: false,
      freshnessPassed: false,
      diagnostics: ["freshness_unknown"],
    }],
  };
  return createVerificationSnapshot(snapshotInput);
}

const claimEvidence = Object.freeze([{
  field: "amount",
  value: "50만원",
  evidenceExcerpt: "지원 금액 50만원의 적용 기간은 2026-01-01부터 2026-12-31까지입니다.",
}]);

function claimSource(
  sourceId: string,
  url: string,
): ApprovalSourcePreflightClaimSource {
  return Object.freeze({
    url,
    claims: claimEvidence,
    verificationClaims: Object.freeze([Object.freeze({
      claimId: claim.claimId,
      field: claim.field,
      kind: claim.kind,
      statement: claim.statement,
      required: claim.required,
      normalizedValue: {
        kind: "money" as const,
        value: {
          amount: 500_000,
          currency: "KRW",
          basis: "monthly" as const,
        },
      },
      qualifiers: claim.qualifiers,
      temporalRequirement: claim.temporalRequirement,
      source: Object.freeze({
        sourceId,
        canonicalUrl: url,
        role: sourceId === "primary"
          ? "primaryOfficial" as const
          : "officialCorroborating" as const,
        authoritative: true,
        evidenceExcerpt: claimEvidence[0]!.evidenceExcerpt,
      }),
    })]),
  });
}

const emptyCoverage: ApprovalSourcePreflightResult["coverage"] = Object.freeze({
  status: "not_required",
  requiredClaims: Object.freeze([]),
  coveredClaimFields: Object.freeze([]),
  uncoveredClaimFields: Object.freeze([]),
  sources: Object.freeze([]),
});

function preflightResult(snapshot: ReturnType<typeof verifiedSnapshot>): ApprovalSourcePreflightResult {
  return Object.freeze({
    sources: Object.freeze([
      { url: "https://primary.example/claim", title: "primary", excerpt: "verified", provenance: "citation" as const },
      { url: "https://official-a.example/claim", title: "official-a", excerpt: "verified", provenance: "citation" as const },
      { url: "https://official-b.example/claim", title: "official-b", excerpt: "verified", provenance: "citation" as const },
      { url: "https://stale.example/claim", title: "stale", excerpt: "stale", provenance: "citation" as const },
      { url: "https://rejected.example/claim", title: "rejected", excerpt: "rejected", provenance: "citation" as const },
    ]),
    claimSources: Object.freeze([
      claimSource("primary", "https://primary.example/claim"),
      claimSource("official-a", "https://official-a.example/claim"),
      claimSource("official-b", "https://official-b.example/claim"),
      claimSource("stale", "https://stale.example/claim"),
    ]),
    coverage: emptyCoverage,
    verificationSnapshot: snapshot,
  });
}

describe("AIWorkflow explicit Verification Generation Gate", () => {
  beforeEach(() => {
    vi.mocked(runApprovalSourcePreflight).mockReset();
  });

  /**
   * D-045: 근거가 부족해도 생성을 시작한다. 막던 관문(Preflight 의미 검증·
   * 커버리지, 생성 직전 Gate)이 모두 진단으로 내려갔다.
   */
  it("still generates when a required explicit Claim has no verified source", async () => {
    vi.mocked(runApprovalSourcePreflight).mockResolvedValue(Object.freeze({
      sources: Object.freeze([]),
      claimSources: Object.freeze([]),
      coverage: emptyCoverage,
      verificationSnapshot: insufficientSnapshot(),
    }));
    const provider = new RecordingProvider();

    await expect(new AIWorkflow(provider, strategy).generate(input)).resolves.toBeDefined();
    expect(provider.calls).toBe(1);
  });

  it("calls Generation once with Claim-ID-owned canonical evidence and only verified fresh URLs", async () => {
    vi.mocked(runApprovalSourcePreflight).mockResolvedValue(preflightResult(verifiedSnapshot()));
    const provider = new RecordingProvider();

    const generated = await new AIWorkflow(provider, strategy).generate(input);

    expect(provider.calls).toBe(1);
    expect(provider.request?.metadata?.verificationGenerationMode).toBe("structured_claims_v2");
    expect(provider.request?.instruction).toContain("Explicit verification Generation bundle");
    expect(provider.request?.instruction).toContain("Structured generated factual-Claim inventory");
    expect(provider.request?.instruction).toContain('"claimId":"claim-amount"');
    expect(provider.request?.instruction).toContain('"basis":"monthly"');
    expect(provider.request?.instruction).toContain('"qualifiers":{"basis":"monthly"}');
    expect(provider.request?.instruction).not.toContain("Claim field:");
    expect(provider.request?.instruction).toContain("https://primary.example/claim");
    expect(provider.request?.instruction).toContain("https://official-a.example/claim");
    expect(provider.request?.instruction).toContain("https://official-b.example/claim");
    /**
     * D-045: 번들이 검증 결과로 출처를 걸러내지 않으므로, 인정 범위 안에서 열린
     * 출처는 그대로 생성에 전달된다.
     */
    expect(provider.request?.instruction).toContain("https://stale.example/claim");
    expect(generated.document.metadata?.generatedClaimVerification?.semanticContractVersion).toBe(1);
    expect(generated.document.metadata?.generatedClaimVerification?.semanticClaims?.[0]).toMatchObject({
      claimId: claim.claimId,
      surfaceText: "현재 지원 금액은 월 50만원입니다.",
      normalizedValue: {
        kind: "money",
        value: { amount: 500_000, currency: "KRW", basis: "monthly" },
      },
    });
    /** D-045: 인정 범위 안에서 열린 출처는 검증 결과와 무관하게 모두 기록된다. */
    expect(generated.document.metadata?.approvalEvidence?.sources.map((source) => source.url)).toEqual([
      "https://primary.example/claim",
      "https://official-a.example/claim",
      "https://official-b.example/claim",
      "https://stale.example/claim",
      "https://rejected.example/claim",
    ]);
  });
});
