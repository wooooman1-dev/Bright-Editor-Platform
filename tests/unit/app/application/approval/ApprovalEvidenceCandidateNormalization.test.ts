import { describe, expect, it } from "vitest";

import { normalizeApprovalEvidenceCandidates } from "../../../../../app/application/approval/ApprovalEvidenceCandidateNormalization";
import type { UserData } from "../../../../../app/user-flow/user-data";

const data: UserData = {
  workspace: { id: "workspace-1", name: "Studio" },
  brands: [],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    name: "생활경제",
    description: "",
    createdAt: "now",
    updatedAt: "now",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "통장 쪼개기 방법",
    body: "",
    status: "ready",
    updatedAt: "now",
    quality: {
      approved: true,
      approvalType: "standard",
      approvalState: "approved",
      findings: [],
      overallScore: 100,
      reviews: [],
      dimensions: [],
      tasks: [],
      reviewedAt: "now",
      reviewedRevisionId: "revision",
      weights: {} as never,
    },
    document: {
      id: "document-1",
      title: "통장 쪼개기 방법",
      metadata: {
        buttonCount: 0,
        createdAt: "now",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "now",
        version: 1,
        videoCount: 0,
        wordCount: 10,
        approvalEvidence: {
          version: "1.0",
          status: "needs_review",
          reviewedAt: "now",
          reviewedRevisionId: "revision",
          sources: [
            {
              sourceId: "source-1",
              url: "https://www.fsc.go.kr/po010101/74600?utm_source=openai&curPage=169",
              title: "금융정책",
              publisher: "금융위원회",
              sourceType: "official_institution",
              retrievedAt: "now",
              verified: false,
              facts: [{ field: "yearSignal", value: "2020" }],
            },
            {
              sourceId: "source-2",
              url: "https://www.fsc.go.kr/po010101/74600?curPage=169",
              title: "",
              publisher: "www.fsc.go.kr",
              sourceType: "official_institution",
              retrievedAt: "now",
              verified: false,
              facts: [],
            },
          ],
        },
      },
      blocks: [{ id: "p1", type: "paragraph", text: "계좌 역할을 설명합니다." }],
    },
  }],
};

describe("approval Evidence candidate normalization", () => {
  it("removes tracked canonical duplicates before the next audit", () => {
    const result = normalizeApprovalEvidenceCandidates(data, "content-1");
    const content = result.contents[0]!;
    const sources = content.document?.metadata?.approvalEvidence?.sources;

    expect(sources).toHaveLength(1);
    expect(sources?.[0]).toMatchObject({
      sourceId: "source-1",
      url: "https://www.fsc.go.kr/po010101/74600?curPage=169",
      canonicalUrl: "https://www.fsc.go.kr/po010101/74600?curPage=169",
      verified: false,
    });
    expect(content.document?.metadata?.approvalEvidence?.reviewedRevisionId).toBeUndefined();
    expect(content.quality).toBeUndefined();
    expect(content.status).toBe("in_review");
  });

  it("returns the original data when no candidate normalization is needed", () => {
    const clean = normalizeApprovalEvidenceCandidates(data, "missing-content");
    expect(clean).toBe(data);
  });
});
