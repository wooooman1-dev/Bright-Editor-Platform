import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("node:fs/promises", () => ({ access: mocks.access }));

import { calculateTistoryReadiness } from "../../../../../app/application/publishing/TistoryPublishingPreparation";
import { calculateWordPressDraftReadiness } from "../../../../../app/application/publishing/WordPressDraftReadiness";
import type { UserData } from "../../../../../app/user-flow/user-data";
import type { WordPressCategoryListResult } from "../../../../../apps/wordpress";
import {
  createGeneratedClaimVerificationRecord,
  createVerificationSnapshot,
  type VerificationClaimSpec,
  type VerificationSourceAssessment,
} from "../../../../../core/approval";
import { safeDraftPermissions, type PlatformConnection } from "../../../../../core/connections";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
  type ContentDocument,
} from "../../../../../core/content";
import { editorialRevisionId, type QualityReport } from "../../../../../core/quality";

const NOW = "2026-08-08T00:00:00.000Z";
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

function assessment(
  sourceId: string,
  role: VerificationSourceAssessment["role"],
): VerificationSourceAssessment {
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
  confirmedAt: NOW,
});

function baseDocument(text: string): ContentDocument {
  return Object.freeze({
    id: "content-1",
    title: "지원 금액 확인 방법",
    blocks: Object.freeze([
      Object.freeze({ id: "p1", type: "paragraph" as const, text }),
    ]),
    metadata: Object.freeze({
      buttonCount: 0,
      createdAt: NOW,
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: NOW,
      version: 1,
      videoCount: 0,
      wordCount: 5,
    }),
  });
}

function changedDocument(): ContentDocument {
  const verified = baseDocument("현재 지원 금액은 50만원입니다.");
  const generatedClaimVerification = createGeneratedClaimVerificationRecord({
    document: verified,
    plan,
    snapshot,
    boundEditorialRevisionId: editorialRevisionId(verified),
  });
  return Object.freeze({
    ...verified,
    blocks: Object.freeze([
      Object.freeze({ id: "p1", type: "paragraph" as const, text: "현재 지원 금액은 70만원입니다." }),
    ]),
    metadata: Object.freeze({
      ...verified.metadata!,
      generatedClaimVerification,
    }),
  });
}

function approvedQuality(document: ContentDocument): QualityReport {
  return Object.freeze({
    approved: true,
    approvalType: "standard" as const,
    approvalState: "approved" as const,
    findings: Object.freeze([]),
    overallScore: 100,
    reviews: Object.freeze([]),
    dimensions: Object.freeze([]),
    tasks: Object.freeze([]),
    reviewedAt: NOW,
    reviewedRevisionId: editorialRevisionId(document),
    weights: Object.freeze({}) as QualityReport["weights"],
  });
}

function project(platform: "wordpress" | "tistory") {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "지원 정보",
    description: "공식 지원 정보를 설명합니다.",
    selectedPublishingAccountIds: [`${platform}-1`],
    strategy: {
      primaryTopic: "지원 정보",
      subtopics: [],
      excludedTopics: [],
      defaultContentType: "article",
      defaultPlatform: platform,
      targetAudience: "reader",
      tone: "clear",
      internalLinkPolicy: "real",
      relatedPostPolicy: "real",
      ctaPolicy: "optional",
      imageStrategy: "placeholder",
      seoPolicy: "people-first",
      defaultPublishingAccountId: `${platform}-1`,
    },
    createdAt: NOW,
    updatedAt: NOW,
  } as const;
}

function workspace(platform: "wordpress" | "tistory") {
  return {
    id: "workspace-1",
    name: "Studio",
    settings: {
      enabledPlatforms: [platform],
      publishing: {
        reviewFirst: true as const,
        draftOnly: true as const,
        publicPublish: false as const,
        sequentialDraftSave: true,
        qualityApprovalRequired: true,
      },
      appearance: { theme: "system" as const },
    },
  };
}

function wordpressConnection(): PlatformConnection {
  return {
    id: "wordpress-1",
    workspaceId: "workspace-1",
    platform: "wordpress",
    displayName: "Example",
    status: "connected",
    publicMetadata: {
      siteUrl: "https://example.com",
      username: "editor",
      canCreateDrafts: true,
    },
    secretReference: "secret-reference",
    createdAt: NOW,
    updatedAt: NOW,
    lastVerifiedAt: NOW,
    selectedAsDefault: false,
    version: 1,
    automationPermissions: safeDraftPermissions,
    publishingPolicy: "review_first",
  };
}

function tistoryConnection(): PlatformConnection {
  return {
    id: "tistory-1",
    workspaceId: "workspace-1",
    platform: "tistory",
    displayName: "Example",
    status: "connected",
    publicMetadata: { blogId: "example", sessionStateAvailable: true },
    createdAt: NOW,
    updatedAt: NOW,
    lastVerifiedAt: NOW,
    selectedAsDefault: false,
    version: 1,
    automationPermissions: safeDraftPermissions,
    publishingPolicy: "review_first",
  };
}

function wordpressCategoryResult(): WordPressCategoryListResult {
  return Object.freeze({
    platform: "wordpress",
    platformConnectionId: "wordpress-1",
    categories: Object.freeze([{
      id: "12",
      externalCategoryId: "12",
      platform: "wordpress" as const,
      name: "Household",
      selectable: true,
    }]),
    hasMore: false,
    retrievedAt: NOW,
    warnings: Object.freeze([]),
  });
}

describe("Generated Claim publishing readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(undefined);
  });

  it("blocks WordPress Draft readiness even when the stored Quality report is current and approved", () => {
    const document = changedDocument();
    const currentProject = project("wordpress");
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: currentProject.id,
      title: document.title,
      body: "",
      status: "ready" as const,
      updatedAt: NOW,
      platform: "wordpress",
      publishingAccountId: "wordpress-1",
      selectedPublishingAccountIds: ["wordpress-1"],
      opportunity,
      primaryKeyword: opportunity.primaryKeyword,
      searchIntent: opportunity.searchIntent,
      contentType: opportunity.contentType,
      document,
      quality: approvedQuality(document),
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["12"],
          categoryNames: ["Household"],
          updatedAt: NOW,
        },
      },
    } as const;
    const data: UserData = {
      workspace: workspace("wordpress"),
      brands: [],
      projects: [currentProject],
      contents: [content],
    };

    const readiness = calculateWordPressDraftReadiness({
      data,
      project: currentProject,
      content,
      connection: wordpressConnection(),
      categoryResult: wordpressCategoryResult(),
      selectedTarget: true,
      finalConfirmation: true,
      mediaValidationPassed: true,
    });

    expect(readiness.checks.find((item) => item.key === "quality_revision")?.passed).toBe(true);
    expect(readiness.checks.find((item) => item.key === "generated_claim_verification")).toMatchObject({ passed: false });
    expect(readiness.checks.find((item) => item.key === "generated_claim_verification")?.message).toContain("70만원");
    expect(readiness.ready).toBe(false);
    expect(readiness.executable).toBe(false);
  });

  it("blocks Tistory Draft readiness on the same changed verified Claim", async () => {
    const document = changedDocument();
    const currentProject = project("tistory");
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: currentProject.id,
      title: document.title,
      body: "",
      status: "ready" as const,
      updatedAt: NOW,
      platform: "tistory",
      publishingAccountId: "tistory-1",
      selectedPublishingAccountIds: ["tistory-1"],
      opportunity,
      primaryKeyword: opportunity.primaryKeyword,
      searchIntent: opportunity.searchIntent,
      contentType: opportunity.contentType,
      document,
      quality: approvedQuality(document),
      publishingPreparation: {
        tistory: {
          publishingAccountId: "tistory-1",
          platformCategoryId: null,
          platformCategoryName: null,
          updatedAt: NOW,
        },
      },
    } as const;
    const data: UserData = {
      workspace: workspace("tistory"),
      brands: [],
      projects: [currentProject],
      contents: [content],
    };

    const readiness = await calculateTistoryReadiness({
      data,
      project: currentProject,
      content,
      connection: tistoryConnection(),
      selectedTarget: true,
      finalConfirmation: true,
      root: "root",
    });

    expect(readiness.checks.find((item) => item.key === "generated_claim_verification")).toMatchObject({ passed: false });
    expect(readiness.checks.find((item) => item.key === "generated_claim_verification")?.message).toContain("70만원");
    expect(readiness.ready).toBe(false);
  });
});
