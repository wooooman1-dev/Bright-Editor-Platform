import { describe, expect, it } from "vitest";

import { calculateWordPressDraftReadiness } from "../../../../../app/application/publishing/WordPressDraftReadiness";
import { confirmContentOpportunity, createContentOpportunityCandidate, type ContentDocument } from "../../../../../core/content";
import { safeDraftPermissions, type PlatformConnection } from "../../../../../core/connections";
import { contentRevisionId, type QualityReport } from "../../../../../core/quality";
import type { UserData } from "../../../../../app/user-flow/user-data";

const NOW = "2026-07-31T00:00:00.000Z";

function contaminatedOpportunity() {
  return confirmContentOpportunity(createContentOpportunityCandidate({
    sourceRequest: "밝은재테크 프로젝트에서 아직 다루지 않은 생활경제 주제를 선정해줘",
    selectionMode: "automatic",
    selectedTopic: "밝은재테크 통장 쪼개기 방법",
    primaryKeyword: "밝은재테크 통장 쪼개기",
    secondaryKeywords: ["생활비 통장"],
    searchIntent: "통장 구조와 계좌 역할을 결정",
    audience: "직장인",
    contentType: "article",
    contentAngle: "계좌 역할과 선택 기준",
    readerProblem: "통장 역할을 정하지 못함",
    expectedCoverage: ["계좌 역할"],
    selectionRationale: "콘텐츠 공백",
    opportunityEvidence: [{ source: "unknown", summary: "검색량 미검증" }],
    confidence: 0.7,
    cautions: [],
    projectId: "project-1",
  }), {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    confirmedAt: NOW,
  });
}

function quality(document: ContentDocument): QualityReport {
  return {
    approved: true,
    approvalType: "standard",
    approvalState: "approved",
    findings: [],
    overallScore: 100,
    reviews: [],
    dimensions: [],
    tasks: [],
    reviewedAt: NOW,
    reviewedRevisionId: contentRevisionId(document),
    weights: {} as QualityReport["weights"],
  };
}

describe("WordPress Draft Project identity guard", () => {
  it("blocks a legacy automatic Planning snapshot whose keyword is prefixed by the Project name", () => {
    const document: ContentDocument = {
      id: "document-1",
      title: "밝은재테크 통장 쪼개기 방법",
      blocks: [{ id: "p1", type: "paragraph", text: "통장 역할을 설명합니다." }],
    };
    const project = {
      id: "project-1",
      workspaceId: "workspace-1",
      name: "밝은재테크",
      description: "",
      selectedPublishingAccountIds: ["wordpress-1"],
      createdAt: NOW,
      updatedAt: NOW,
    } as const;
    const opportunity = contaminatedOpportunity();
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: document.title,
      body: "",
      status: "ready" as const,
      updatedAt: NOW,
      platform: "wordpress",
      publishingAccountId: "wordpress-1",
      selectedPublishingAccountIds: ["wordpress-1"],
      primaryKeyword: opportunity.primaryKeyword,
      relatedKeywords: opportunity.secondaryKeywords,
      opportunity,
      document,
      quality: quality(document),
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["2"],
          categoryNames: ["생활재테크"],
          updatedAt: NOW,
        },
      },
    } as const;
    const data: UserData = {
      workspace: {
        id: "workspace-1",
        name: "Studio",
        settings: {
          enabledPlatforms: ["wordpress"],
          publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true },
          appearance: { theme: "system" },
        },
      },
      brands: [],
      projects: [project],
      contents: [content],
    };
    const connection: PlatformConnection = {
      id: "wordpress-1",
      workspaceId: "workspace-1",
      platform: "wordpress",
      displayName: "밝은재테크",
      status: "connected",
      publicMetadata: { siteUrl: "https://example.com", username: "editor", canCreateDrafts: true },
      secretReference: "secret-reference",
      createdAt: NOW,
      updatedAt: NOW,
      lastVerifiedAt: NOW,
      selectedAsDefault: false,
      version: 1,
      automationPermissions: safeDraftPermissions,
      publishingPolicy: "review_first",
    };

    const readiness = calculateWordPressDraftReadiness({
      data,
      project,
      content,
      connection,
      categoryResult: {
        platform: "wordpress",
        platformConnectionId: connection.id,
        categories: [{ id: "2", externalCategoryId: "2", platform: "wordpress", name: "생활재테크", selectable: true }],
        hasMore: false,
        retrievedAt: NOW,
        warnings: [],
      },
      selectedTarget: true,
      finalConfirmation: true,
    });

    const check = readiness.checks.find((item) => item.key === "planning_identity");
    expect(check).toMatchObject({ passed: false });
    expect(check?.message).toContain("새 Content에서 Planning을 다시 실행해 주세요");
    expect(readiness.ready).toBe(false);
    expect(readiness.executable).toBe(false);
  });
});
