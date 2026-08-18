import { describe, expect, it } from "vitest";

import {
  approvalEvidenceFingerprint,
  approvalReadinessInspectionVersion,
} from "../../../../app/application/approval/ApprovalReadinessExecutionIdentity";
import { publishingInternalLinkContextKey } from "../../../../app/application/publishing/InternalLinkCatalogPolicy";
import { approvalReadinessAutoRunDecision } from "../../../../app/user-flow/ApprovalReadinessActions";
import type { ApprovalEvidencePack, SiteApprovalReadinessSnapshot } from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";
import { editorialRevisionId, type QualityReport } from "../../../../core/quality";
import type { UserContent } from "../../../../app/user-flow/user-data";

const document: ContentDocument = {
  id: "content-1",
  title: "서양미술 초상화 감상법",
  metadata: {
    buttonCount: 0,
    createdAt: "2026-07-28T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 2,
    source: "test",
    updatedAt: "2026-07-28T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 100,
  },
  blocks: [{ id: "p1", type: "paragraph", text: "초상화의 시선과 손, 배경을 차례로 관찰합니다." }],
};

function quality(revisionId: string, reviewedAt = "2026-07-28T01:00:00.000Z"): QualityReport {
  return {
    approved: true,
    approvalType: "standard",
    approvalState: "approved",
    findings: [],
    overallScore: 100,
    reviews: [],
    dimensions: [],
    tasks: [],
    reviewedAt,
    reviewedRevisionId: revisionId,
    weights: {
      searchIntent: 0,
      seo: 0,
      readability: 0,
      structure: 0,
      completeness: 0,
      usefulness: 0,
      htmlQuality: 0,
      imageStrategy: 0,
      internalLinks: 0,
      cta: 0,
    },
  };
}

function blockedQuality(revisionId: string): QualityReport {
  return { ...quality(revisionId), approved: false, approvalType: "none", approvalState: "blocked" };
}

function content(
  nextDocument: ContentDocument = document,
  nextQuality: QualityReport | undefined = quality(editorialRevisionId(nextDocument)),
  categoryId = "2",
): UserContent {
  return {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: nextDocument.title,
    body: "",
    status: "ready",
    updatedAt: "2026-07-28T01:00:00.000Z",
    document: nextDocument,
    quality: nextQuality,
    contentPurpose: "adsense_approval",
    ...(categoryId ? {
      platform: "wordpress",
      publishingAccountId: "wordpress-1",
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: [categoryId],
          categoryNames: [categoryId === "2" ? "생활재테크" : "다른 카테고리"],
          updatedAt: "2026-07-28T01:00:00.000Z",
        },
      },
    } : {}),
  } as UserContent;
}

function evidence(reviewedRevisionId: string, status: ApprovalEvidencePack["status"] = "verified"): ApprovalEvidencePack {
  return {
    version: "1.0",
    status,
    reviewedAt: "2026-07-28T02:00:00.000Z",
    reviewedRevisionId,
    sources: [],
  };
}

const site: SiteApprovalReadinessSnapshot = {
  version: "1.0",
  status: "passed",
  checkedAt: "2026-07-28T02:00:00.000Z",
  checks: [],
};

function checkedDocument(
  revisionId: string,
  contextContent: UserContent,
  status: ApprovalEvidencePack["status"] = "verified",
  siteSnapshot: SiteApprovalReadinessSnapshot = site,
): ContentDocument {
  const checked: ContentDocument = {
    ...document,
    metadata: {
      ...document.metadata!,
      approvalEvidence: evidence(revisionId, status),
      siteApprovalReadiness: siteSnapshot,
      availableRelatedContentCandidates: 0,
      internalLinkCatalogStatus: "evaluated",
      internalLinkCatalogContextKey: publishingInternalLinkContextKey(contextContent),
    },
  };
  return {
    ...checked,
    metadata: {
      ...checked.metadata!,
      approvalReadinessExecution: {
        version: approvalReadinessInspectionVersion,
        key: "stored-execution",
        editorialRevisionId: revisionId,
        publishingContextKey: publishingInternalLinkContextKey(contextContent),
        evidenceFingerprint: approvalEvidenceFingerprint(checked),
        status: "completed",
        checkedAt: "2026-07-28T02:00:00.000Z",
      },
    },
  };
}

describe("ApprovalReadinessActions auto run decision", () => {
  it("suppresses Evidence details when the Planning contract proves Evidence is not applicable", () => {
    const value = {
      ...content(),
      opportunity: {
        requiredEvidenceContract: {
          schemaVersion: 1,
          contractId: "contract-1",
          policyId: "adsense_approval_mode",
          policyVersion: "1.0",
          profileId: "wordpress_life_economy_v1",
          profileVersion: "1.0",
          profileSourceRequirementApplicable: false,
          explicitVerificationRequired: false,
          sourceRequirements: [],
          requiredClaims: [],
        },
      },
    } as unknown as UserContent;
    const decision = approvalReadinessAutoRunDecision(value);

    expect(decision.evidenceApplicable).toBe(false);
    expect(decision.sources).toEqual([]);
    expect(decision.evidenceSummary).toBeUndefined();
  });

  it("runs automatically once after the current revision receives standard quality approval", () => {
    const decision = approvalReadinessAutoRunDecision(content());

    expect(decision.shouldRun).toBe(true);
    expect(decision.hasStoredResult).toBe(false);
  });

  it("runs automatically for a current blocked quality review so independent checks are collected", () => {
    const revisionId = editorialRevisionId(document);
    const decision = approvalReadinessAutoRunDecision(content(document, blockedQuality(revisionId)));

    expect(decision.shouldRun).toBe(true);
    expect(decision.hasStoredResult).toBe(false);
  });

  it("reuses a stored result for the same revision and publishing context", () => {
    const revisionId = editorialRevisionId(document);
    const contextContent = content(document, quality(revisionId));
    const storedDocument = checkedDocument(revisionId, contextContent);
    const decision = approvalReadinessAutoRunDecision(content(storedDocument, quality(revisionId)));

    expect(decision.shouldRun).toBe(false);
    expect(decision.hasStoredResult).toBe(true);
  });

  it("does not repeat a failed deterministic check for the same revision and publishing context", () => {
    const revisionId = editorialRevisionId(document);
    const contextContent = content(document, quality(revisionId));
    const storedDocument = checkedDocument(
      revisionId,
      contextContent,
      "needs_review",
      { ...site, status: "needs_review" },
    );
    const decision = approvalReadinessAutoRunDecision(content(storedDocument, quality(revisionId)));

    expect(decision.shouldRun).toBe(false);
    expect(decision.hasStoredResult).toBe(true);
  });

  it("invalidates a legacy WordPress manual-review snapshot and runs the current automatic audit", () => {
    const revisionId = editorialRevisionId(document);
    const contextContent = content(document, quality(revisionId));
    const storedDocument = checkedDocument(revisionId, contextContent, "verified", {
      ...site,
      status: "needs_review",
      checks: [{
        key: "theme_plugin_review",
        passed: false,
        requirement: "manual",
        message: "Theme 또는 Plugin을 수동으로 확인해야 합니다.",
      }],
    });
    const decision = approvalReadinessAutoRunDecision(content(storedDocument, quality(revisionId)));

    expect(decision.hasStoredResult).toBe(false);
    expect(decision.shouldRun).toBe(true);
  });

  it("invalidates a stored result when the WordPress Category changes", () => {
    const revisionId = editorialRevisionId(document);
    const originalContext = content(document, quality(revisionId), "2");
    const storedDocument = checkedDocument(revisionId, originalContext);
    const changedCategory = content(storedDocument, quality(revisionId), "3");
    const decision = approvalReadinessAutoRunDecision(changedCategory);

    expect(decision.hasStoredResult).toBe(false);
    expect(decision.shouldRun).toBe(true);
  });

  it("waits for a standard quality review that matches the current revision", () => {
    const staleQuality = quality("rev-stale");
    const decision = approvalReadinessAutoRunDecision(content(document, staleQuality));

    expect(decision.shouldRun).toBe(false);
    expect(decision.hasStoredResult).toBe(false);
  });
});
