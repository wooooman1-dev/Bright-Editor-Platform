import { describe, expect, it } from "vitest";

import { applyApprovalPersistencePolicy } from "../../../../../app/application/approval/ApprovalAwarePersistenceStore";
import type { ApprovalAwareContent } from "../../../../../app/application/approval/ApprovalContentPolicy";
import type { ApprovalEvidenceSource } from "../../../../../core/approval";
import type { UserContent, UserData } from "../../../../../app/user-flow/user-data";

function candidateData(
  paragraph: string,
  sources: readonly ApprovalEvidenceSource[],
  opportunity?: UserContent["opportunity"],
  includeInitialEvidence = true,
): UserData {
  const content: ApprovalAwareContent = {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "통장 쪼개기 방법",
    body: "",
    status: "in_review",
    updatedAt: "2026-07-31T00:00:00.000Z",
    contentPurpose: "adsense_approval",
    approvalPolicyId: "adsense_approval_mode",
    approvalPolicyVersion: "1.0",
    approvalProfileId: "wordpress_life_economy_v1",
    approvalProfileVersion: "1.0",
    document: {
      id: "document-1",
      title: "통장 쪼개기 방법",
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
        ...(includeInitialEvidence ? {
          approvalEvidence: {
            version: "1.0" as const,
            status: "needs_review" as const,
            sources,
          },
        } : {}),
      },
      blocks: [{ id: "p1", type: "paragraph", text: paragraph }],
    },
    ...(opportunity ? { opportunity } : {}),
  };

  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "생활경제",
      description: "",
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    }],
    contents: [content],
  };
}

const webCandidate: ApprovalEvidenceSource = {
  sourceId: "web-source-1",
  url: "https://www.fsc.go.kr/po010101/74600?curPage=169&utm_source=openai",
  canonicalUrl: "https://www.fsc.go.kr/po010101/74600?curPage=169&utm_source=openai",
  title: "금융위원회 공식 안내",
  publisher: "금융위원회",
  sourceType: "official_institution",
  retrievedAt: "2026-07-31T00:00:00.000Z",
  verified: false,
  provenance: "search_candidate",
  selected: false,
  facts: [],
};

describe("approval Evidence persistence merge", () => {
  it("persists the canonical not-required state when Planning proves no mandatory Evidence applies", () => {
    const opportunity = {
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
    } as unknown as UserContent["opportunity"];
    const saved = applyApprovalPersistencePolicy(undefined, candidateData(
      "변경 가능한 필수 사실이 없는 일반 안내입니다.",
      [],
      opportunity,
      false,
    ));

    expect(saved.contents[0]?.document?.metadata?.approvalEvidence).toEqual({
      version: "1.0",
      status: "not_required",
      coverageStatus: "not_required",
      sourcePolicyCompliance: "not_required",
      sources: [],
    });
  });

  it("drops a search-only candidate that is not linked to a Content Claim", () => {
    const saved = applyApprovalPersistencePolicy(undefined, candidateData(
      "공식 안내를 바탕으로 계좌 역할을 설명합니다.",
      [webCandidate],
    ));

    expect(saved.contents[0]?.document?.metadata?.approvalEvidence).toMatchObject({
      status: "missing",
      coverageStatus: "missing",
      sources: [],
    });
  });

  it("merges a visible tracked URL into the same canonical web candidate and adds cited context", () => {
    const saved = applyApprovalPersistencePolicy(undefined, candidateData(
      "공식 자료 https://www.fsc.go.kr/po010101/74600?utm_medium=referral&curPage=169 를 확인합니다.",
      [webCandidate],
    ));
    const sources = saved.contents[0]?.document?.metadata?.approvalEvidence?.sources;

    expect(sources).toHaveLength(1);
    expect(sources?.[0]).toMatchObject({
      sourceId: "web-source-1",
      url: "https://www.fsc.go.kr/po010101/74600?curPage=169",
      canonicalUrl: "https://www.fsc.go.kr/po010101/74600?curPage=169",
      title: "금융위원회 공식 안내",
      publisher: "금융위원회",
      verified: false,
      provenance: "document_link",
      selected: false,
    });
    expect(sources?.[0]?.linkedBlockIds).toEqual(["p1"]);
    expect(sources?.[0]?.facts).toEqual([
      expect.objectContaining({
        field: "citedContext",
        value: expect.stringContaining("공식 자료"),
      }),
    ]);
  });
});
