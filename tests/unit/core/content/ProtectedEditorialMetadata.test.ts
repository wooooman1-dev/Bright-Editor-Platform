import { describe, expect, it } from "vitest";

import { restoreProtectedEditorialMetadata, type ContentDocument } from "../../../../core/content";

const current: ContentDocument = {
  id: "content-1",
  title: "현재 원고",
  blocks: [{ id: "p1", type: "paragraph", text: "현재 원고입니다." }],
  metadata: {
    buttonCount: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 1,
    source: "test",
    updatedAt: "2026-07-31T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 10,
    approvalPolicy: {
      policyId: "adsense_approval_mode",
      policyVersion: "1.0",
      contentPurpose: "adsense_approval",
      profileId: "wordpress_life_economy_v1",
      profileVersion: "1.0",
      generatedAt: "2026-07-31T00:00:00.000Z",
    },
    approvalEvidence: {
      version: "1.0",
      status: "verified",
      reviewedAt: "2026-07-31T00:00:00.000Z",
      reviewedRevisionId: "old-revision",
      sources: [{
        sourceId: "source-1",
        url: "https://www.gov.kr/example",
        canonicalUrl: "https://www.gov.kr/example",
        title: "정부 공식 안내",
        publisher: "gov.kr",
        sourceType: "official_institution",
        retrievedAt: "2026-07-31T00:00:00.000Z",
        verified: true,
        selected: true,
        verificationStatus: "verified",
        checkedAt: "2026-07-31T00:00:00.000Z",
        facts: [{ field: "yearSignal", value: "2026" }],
      }],
    },
  },
};

const candidate: ContentDocument = {
  id: "content-1",
  title: "최종 편집 원고",
  blocks: [{ id: "p1", type: "paragraph", text: "최종 편집 원고입니다." }],
  metadata: {
    buttonCount: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    generator: "review",
    imageCount: 0,
    language: "ko",
    readingTime: 1,
    source: "ai",
    updatedAt: "2026-07-31T00:10:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 10,
  },
};

describe("protected editorial metadata", () => {
  it("preserves approval policy and source candidates while invalidating the old verification result", () => {
    const result = restoreProtectedEditorialMetadata(current, candidate);

    expect(result.metadata?.approvalPolicy).toEqual(current.metadata?.approvalPolicy);
    expect(result.metadata?.approvalEvidence).toMatchObject({
      version: "1.0",
      status: "needs_review",
      sources: [{
        sourceId: "source-1",
        url: "https://www.gov.kr/example",
        verified: false,
        selected: false,
      }],
    });
    expect(result.metadata?.approvalEvidence?.reviewedAt).toBeUndefined();
    expect(result.metadata?.approvalEvidence?.reviewedRevisionId).toBeUndefined();
    expect(result.metadata?.approvalEvidence?.sources[0]?.verificationStatus).toBeUndefined();
  });
});
