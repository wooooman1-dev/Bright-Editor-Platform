import { describe, expect, it } from "vitest";

import {
  approvalEvidenceClaimFieldsForSourceUrl,
  verifyApprovalEvidence,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const unknownOfficialUrl =
  "https://new-policy.city.go.kr/not-registered-in-source-map/2026";

function document(): ContentDocument {
  return {
    id: "content-unknown-source",
    title: "새 지원정책 신청 기준",
    blocks: [
      {
        id: "eligibility",
        type: "paragraph",
        text: "지원 대상: 만 19세 이상 거주자",
      },
      {
        id: "amount",
        type: "paragraph",
        text: "지원 금액: 100만원",
      },
    ],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-03T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-03T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 30,
      approvalEvidence: {
        version: "1.0",
        status: "needs_review",
        sources: [{
          sourceId: "unknown-official-source",
          url: unknownOfficialUrl,
          canonicalUrl: unknownOfficialUrl,
          title: "새 공식 지원정책 안내",
          publisher: "new-policy.city.go.kr",
          sourceType: "official_institution",
          retrievedAt: "2026-08-03T00:00:00.000Z",
          verified: false,
          provenance: "citation",
          cited: true,
          selected: true,
          facts: [
            {
              field: "eligibility",
              value: "만 19세 이상 거주자",
              excerpt: "지원 대상은 만 19세 이상 거주자입니다.",
            },
            {
              field: "amount",
              value: "100만원",
              excerpt: "지원 금액은 100만원입니다.",
            },
          ],
        }],
      },
    },
  };
}

const officialPage: ApprovalSourcePage = {
  requestedUrl: unknownOfficialUrl,
  finalUrl: unknownOfficialUrl,
  status: 200,
  contentType: "text/html; charset=utf-8",
  title: "새 공식 지원정책 안내",
  publisher: "new-policy.city.go.kr",
  text: "지원 대상은 만 19세 이상 거주자입니다. 지원 금액은 100만원입니다. 신청 전 최신 공고와 제출 서류를 공식 누리집에서 확인해야 합니다. ".repeat(8),
  documentFormat: "html",
  extractionStatus: "extracted",
};

describe("Approval Evidence unknown official source", () => {
  it("verifies an unmapped official URL from its linked Claims and fetched body", () => {
    expect(approvalEvidenceClaimFieldsForSourceUrl(unknownOfficialUrl))
      .toBeUndefined();

    const result = verifyApprovalEvidence(
      document(),
      "wordpress_life_economy_v1",
      [officialPage],
      "2026-08-03T01:00:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.pack.requiredFactFields).toEqual([
      "eligibility",
      "amount",
    ]);
    expect(result.pack.verifiedFactFields).toEqual([
      "eligibility",
      "amount",
    ]);
    expect(result.pack.unverifiedFactFields).toEqual([]);
    expect(result.pack.sources[0]).toMatchObject({
      url: unknownOfficialUrl,
      finalUrl: unknownOfficialUrl,
      verified: true,
      verificationStatus: "verified",
      claimVerificationStatus: "verified",
    });
  });
});