import { describe, expect, it } from "vitest";

import {
  evaluateApprovalReadiness,
  type ApprovalDuplicateCheckSnapshot,
  type ApprovalEvidencePack,
  type SiteApprovalReadinessSnapshot,
} from "../../../../core/approval";
import type { ContentDocument, ContentMetadata } from "../../../../core/content";

const evidence: ApprovalEvidencePack = Object.freeze({
  version: "1.0",
  status: "verified",
  reviewedAt: "2026-07-27T00:00:00.000Z",
  sources: Object.freeze([Object.freeze({
    sourceId: "museum-1",
    url: "https://www.moma.org/collection/works/79802",
    title: "The Starry Night",
    publisher: "The Museum of Modern Art",
    sourceType: "official_institution",
    retrievedAt: "2026-07-27T00:00:00.000Z",
    verified: true,
    facts: Object.freeze([Object.freeze({ field: "holdingInstitution", value: "The Museum of Modern Art" })]),
  })]),
});

const duplicate: ApprovalDuplicateCheckSnapshot = Object.freeze({
  version: "1.0",
  status: "passed",
  checkedAt: "2026-07-27T00:00:00.000Z",
  comparedContentIds: Object.freeze(["content-previous"]),
  highestSimilarity: 0.24,
  reasons: Object.freeze([]),
});

const site: SiteApprovalReadinessSnapshot = Object.freeze({
  version: "1.0",
  status: "passed",
  checkedAt: "2026-07-27T00:00:00.000Z",
  checks: Object.freeze([Object.freeze({ key: "navigation", passed: true, message: "탐색 구조가 정상입니다." })]),
});

function document(metadata: Partial<ContentMetadata> = {}): ContentDocument {
  return {
    id: "content-1",
    title: "별이 빛나는 밤 감상 순서",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 3,
      source: "test",
      updatedAt: "2026-07-27T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      ...metadata,
    },
    blocks: [
      { id: "h1", type: "heading", level: 2, text: "작품을 보는 순서" },
      { id: "p1", type: "paragraph", text: "공식 자료에 따라 화면의 소용돌이와 시선 이동을 차례로 관찰합니다." },
    ],
  };
}

describe("ApprovalReadiness", () => {
  it("keeps a 100-point article separate from application readiness", () => {
    const report = evaluateApprovalReadiness(document(), [], true);

    expect(report.applicationReady).toBe(false);
    expect(report.status).toBe("needs_review");
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "standard_quality", status: "passed" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "not_evaluated" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "duplicate", status: "not_evaluated" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "site_readiness", status: "not_evaluated" }));
  });

  it("passes internal links when the catalog was evaluated and no eligible candidate exists", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "internal_links",
      status: "passed",
      message: expect.stringContaining("기존 공개 글 후보가 없어"),
    }));
  });

  it("does not block internal links when no existing candidate is available", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "category_missing",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.checks).toContainEqual(expect.objectContaining({ key: "internal_links", status: "passed" }));
  });

  it("blocks internal links when candidates exist but no link was placed", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 1,
    }), [], true);

    expect(report.status).toBe("blocked");
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "internal_links", status: "blocked" }));
  });

  it("accepts verified core sources while preserving rejected candidate diagnostics", () => {
    const mixedEvidence: ApprovalEvidencePack = {
      ...evidence,
      sources: [
        evidence.sources[0]!,
        {
          sourceId: "museum-duplicate",
          url: "https://www.moma.org/collection/works/79802?utm_source=openai",
          title: "The Starry Night",
          publisher: "www.moma.org",
          sourceType: "official_institution",
          retrievedAt: "2026-07-27T00:00:00.000Z",
          verified: false,
          facts: [],
          selected: false,
          verificationStatus: "duplicate_source",
          failureReason: "동일한 canonical 출처입니다.",
        },
      ],
    };
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: mixedEvidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
  });

  it("does not block application readiness when only a recommended site item is missing", () => {
    const siteWithRecommendation: SiteApprovalReadinessSnapshot = {
      version: "1.0",
      status: "passed",
      checkedAt: "2026-07-27T00:00:00.000Z",
      checks: [
        { key: "privacy", passed: true, message: "개인정보처리방침을 확인했습니다." },
        { key: "about_contact", passed: false, message: "권장: 소개 페이지가 없습니다.", requirement: "recommended" },
      ],
    };
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: evidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: siteWithRecommendation,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "site_readiness",
      status: "passed",
      message: expect.stringContaining("권장 보완 항목 1개"),
    }));
  });

  it("marks the site application-ready only after every independent gate passes", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: evidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.applicationReady).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("does not require official evidence when explicit verification is not required", () => {
    const report = evaluateApprovalReadiness(document({
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, false);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
  });

  it("requires official evidence when explicit verification is required", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: { ...evidence, status: "missing", sources: [] },
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, true);

    expect(report.applicationReady).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "blocked" }));
  });

  it("passes required official evidence when a verified HTTPS source is present", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: evidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, true);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
  });
});
