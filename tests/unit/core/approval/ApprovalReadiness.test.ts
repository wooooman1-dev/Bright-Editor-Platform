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
      message: expect.stringContaining("강제로 넣지 않았습니다"),
    }));
  });

  it("blocks internal links when category resolution was skipped", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "category_missing",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.status).toBe("blocked");
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "internal_links", status: "blocked" }));
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
});
