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
        buttonCount: 2,
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
          coverageStatus: "verified",
          presentationStatus: "ready",
          requiredFactFields: ["depositProtectionLimit"],
          verifiedFactFields: ["depositProtectionLimit"],
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
              provenance: "document_link",
              linkedBlockIds: ["p1"],
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
              provenance: "search_candidate",
              facts: [],
            },
          ],
        },
      },
      blocks: [
        { id: "p1", type: "paragraph", text: "계좌 역할을 설명합니다." },
        { id: "approval-sources-heading", type: "heading", level: 2, text: "공식 출처", ownership: "system_source_projection" },
        { id: "approval-source-link-1", type: "button", purpose: "source", label: "금융위원회", targetUrl: "https://www.fsc.go.kr", ownership: "system_source_projection" },
        { id: "manual-source-heading", type: "heading", level: 2, text: "참고 자료", ownership: "user_manual" },
        { id: "manual-source-link", type: "button", purpose: "source", label: "직접 선택한 자료", targetUrl: "https://www.kdic.or.kr", ownership: "user_manual" },
      ],
    },
  }],
};

describe("approval Evidence candidate normalization", () => {
  it("upgrades an empty legacy missing pack only when Planning proves Evidence is not required", () => {
    const content = data.contents[0]!;
    const notRequiredData = {
      ...data,
      contents: [{
        ...content,
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
        document: {
          ...content.document!,
          metadata: {
            ...content.document!.metadata!,
            approvalEvidence: { version: "1.0", status: "missing", coverageStatus: "missing", sources: [] },
          },
        },
      }],
    } as unknown as UserData;

    expect(normalizeApprovalEvidenceCandidates(notRequiredData, "content-1")
      .contents[0]?.document?.metadata?.approvalEvidence).toEqual({
      version: "1.0",
      status: "not_required",
      coverageStatus: "not_required",
      sourcePolicyCompliance: "not_required",
      sources: [],
    });
  });

  it("does not reinterpret a legacy missing pack without Planning evidence", () => {
    const content = data.contents[0]!;
    const legacyData: UserData = {
      ...data,
      contents: [{
        ...content,
        document: {
          ...content.document!,
          metadata: {
            ...content.document!.metadata!,
            approvalEvidence: { version: "1.0", status: "missing", coverageStatus: "missing", sources: [] },
          },
        },
      }],
    };

    const result = normalizeApprovalEvidenceCandidates(legacyData, "content-1");
    expect(result).toBe(legacyData);
    expect(result.contents[0]?.document?.metadata?.approvalEvidence?.status).toBe("missing");
  });

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
    expect(content.document?.metadata?.approvalEvidence).toMatchObject({
      coverageStatus: "needs_review",
      presentationStatus: "not_projected",
      verifiedFactFields: [],
      unverifiedFactFields: ["depositProtectionLimit"],
    });
    expect(content.document?.blocks.map((block) => block.id)).toEqual([
      "p1",
      "manual-source-heading",
      "manual-source-link",
    ]);
    expect(content.document?.metadata?.buttonCount).toBe(1);
    expect(content.quality).toBe(data.contents[0]?.quality);
    expect(content.status).toBe("ready");
  });

  it("returns the original data when no candidate normalization is needed", () => {
    const clean = normalizeApprovalEvidenceCandidates(data, "missing-content");
    expect(clean).toBe(data);
  });

  it("merges law.go.kr host and tracking variants, prefers the linked document source, and removes unrelated search results", () => {
    const lawUrl = "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
    const content = data.contents[0]!;
    const document = content.document!;
    const candidateData: UserData = {
      ...data,
      contents: [{
        ...content,
        document: {
          ...document,
          metadata: {
            ...document.metadata!,
            approvalEvidence: {
              version: "1.0",
              status: "needs_review",
              sources: [
                {
                  sourceId: "search-same",
                  url: "https://law.go.kr/lsLinkCommonInfo.do?utm_source=openai&lsJoLnkSeq=1025033501&chrClsCd=010202",
                  title: "검색 후보",
                  publisher: "law.go.kr",
                  sourceType: "official_institution",
                  retrievedAt: "now",
                  verified: false,
                  provenance: "search_candidate",
                  facts: [],
                },
                {
                  sourceId: "document-link",
                  url: lawUrl,
                  title: "국가법령정보센터",
                  publisher: "국가법령정보센터",
                  sourceType: "official_law",
                  retrievedAt: "now",
                  verified: false,
                  provenance: "document_link",
                  citationExcerpt: `출처: ${lawUrl}`,
                  linkedBlockIds: ["claim", "source"],
                  facts: [{ field: "citedContext", value: `출처: ${lawUrl}` }],
                },
                {
                  sourceId: "unrelated",
                  url: "https://www.law.go.kr/LSW/lsRvsDocListP.do?lsId=000355",
                  title: "관련 없는 개정 이력",
                  publisher: "law.go.kr",
                  sourceType: "official_law",
                  retrievedAt: "now",
                  verified: false,
                  provenance: "search_candidate",
                  facts: [],
                },
              ],
            },
          },
        },
      }],
    };

    const sources = normalizeApprovalEvidenceCandidates(candidateData, content.id)
      .contents[0]?.document?.metadata?.approvalEvidence?.sources;

    /**
     * D-045: 본문에 인용되지 않은 검색 후보는 출처가 아니다. 추적 변형인
     * search-same 은 document-link 와 같은 주소라 병합되고, 본문과 무관한
     * unrelated 는 남지 않는다.
     */
    expect(sources).toHaveLength(1);
    expect(sources?.[0]).toMatchObject({
      url: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501",
      provenance: "document_link",
      linkedBlockIds: ["claim", "source"],
      citationExcerpt: `출처: ${lawUrl}`,
      selected: false,
    });
  });
});
