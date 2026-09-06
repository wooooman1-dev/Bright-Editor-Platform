import { describe, expect, it } from "vitest";

import {
  applyInternalLinkCatalogResult,
  ownPublishedExternalPostIds,
  publishingCategoryIdentities,
  rankPublishingPostCandidates,
} from "../../../../../app/application/publishing/InternalLinkCatalogPolicy";

const document = {
  id: "content-1",
  title: "통장 쪼개기",
  blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "생활비 관리" }],
};

describe("platform-aware internal link catalog policy", () => {
  it("treats an evaluated empty WordPress public catalog as completed", () => {
    const result = applyInternalLinkCatalogResult(document, [], "evaluated");
    expect(result.metadata?.internalLinkCatalogStatus).toBe("evaluated");
    expect(result.metadata?.availableRelatedContentCandidates).toBe(0);
    expect(result.blocks).toEqual(document.blocks);
  });

  it("uses every selected WordPress category without inventing candidates", () => {
    const content = {
      id: "content-1",
      projectId: "project-1",
      title: "통장 쪼개기",
      body: "",
      status: "ready" as const,
      updatedAt: "2026-07-30T00:00:00.000Z",
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["12", "13"],
          categoryNames: ["생활경제", "정부지원"],
          updatedAt: "2026-07-30T00:00:00.000Z",
        },
      },
    };
    expect(publishingCategoryIdentities(content)).toEqual([
      { id: "12", name: "생활경제" },
      { id: "13", name: "정부지원" },
    ]);
    const ranked = rankPublishingPostCandidates(document, [{
      externalPostId: "20",
      title: "지원금 확인",
      publishedUrl: "https://brightjaetech.kr/support/",
      categoryId: "13",
      categoryName: "정부지원",
    }], content, []);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["20"]);
  });
  it("never offers the manuscript its own published Post as a candidate", () => {
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "통장 쪼개기",
      body: "",
      status: "ready" as const,
      updatedAt: "2026-08-29T00:00:00.000Z",
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["13"],
          categoryNames: ["정부지원"],
          updatedAt: "2026-08-29T00:00:00.000Z",
        },
      },
    };
    const candidates = [
      {
        externalPostId: "3784",
        title: "통장 쪼개기",
        publishedUrl: "https://brightjaetech.kr/self/",
        categoryId: "13",
        categoryName: "정부지원",
      },
      {
        externalPostId: "20",
        title: "지원금 확인",
        publishedUrl: "https://brightjaetech.kr/support/",
        categoryId: "13",
        categoryName: "정부지원",
      },
    ];
    const ranked = rankPublishingPostCandidates(document, candidates, content, ["3784"]);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["20"]);

    const placed = applyInternalLinkCatalogResult(document, ranked, "evaluated");
    const links = placed.blocks.filter((block) => block.type === "button");
    expect(links.every((block) => block.type === "button"
      && block.targetUrl !== "https://brightjaetech.kr/self/")).toBe(true);
  });

  it("reads the manuscript's own Posts from the publishing records", () => {
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "통장 쪼개기",
      body: "",
      status: "ready" as const,
      updatedAt: "2026-08-29T00:00:00.000Z",
    };
    const record = (contentId: string, externalPostId: string) => ({
      schemaVersion: 1 as const,
      id: `publishing:${contentId}:${externalPostId}`,
      idempotencyKey: `publishing:${contentId}:${externalPostId}`,
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId,
      contentRevisionId: "rev-1",
      executionRevisionId: "exec-1",
      platformConnectionId: "wordpress-1",
      platform: "wordpress" as const,
      workflow: "draft.update" as const,
      status: "verified" as const,
      stage: "complete" as const,
      verified: true,
      uploadedMedia: [],
      cleanupRequired: false,
      verificationChecks: [],
      categoryIds: [],
      categoryNames: [],
      localImageCount: 0,
      featuredImageAssigned: false,
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
      externalPostId,
    });
    const data = {
      contents: [content],
      publishingRecords: [
        record("content-1", "3784"),
        record("content-1", "3784"),
        record("content-2", "3790"),
      ],
    } as unknown as Parameters<typeof ownPublishedExternalPostIds>[0];
    expect(ownPublishedExternalPostIds(data, content)).toEqual(["3784"]);
  });

  it("excludes the Post published by the manuscript this one was rewritten from", () => {
    const original = {
      id: "content-old",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "국민연금 임의계속가입 조건, 퇴직 뒤 가입기간부터 판단하는 기준",
      body: "",
      status: "ready" as const,
      updatedAt: "2026-08-24T00:00:00.000Z",
    };
    const rewrite = {
      ...original,
      id: "content-new",
      title: "국민연금 임의계속가입 조건, 퇴직 후 가입기간부터 따져보는 법",
      preservedFromContentId: "content-old",
    };
    const record = (contentId: string, externalPostId: string) => ({
      schemaVersion: 1 as const,
      id: `publishing:${contentId}:${externalPostId}`,
      idempotencyKey: `publishing:${contentId}:${externalPostId}`,
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId,
      contentRevisionId: "rev-1",
      executionRevisionId: "exec-1",
      platformConnectionId: "wordpress-1",
      platform: "wordpress" as const,
      workflow: "draft.create" as const,
      status: "verified" as const,
      stage: "complete" as const,
      verified: true,
      uploadedMedia: [],
      cleanupRequired: false,
      verificationChecks: [],
      categoryIds: [],
      categoryNames: [],
      localImageCount: 0,
      featuredImageAssigned: false,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      externalPostId,
    });
    const data = {
      contents: [original, rewrite],
      publishingRecords: [record("content-old", "3778"), record("content-other", "3775")],
    } as unknown as Parameters<typeof ownPublishedExternalPostIds>[0];

    // 다시 쓴 원고는 아직 한 번도 발행되지 않았지만, 이전 판본의 글은 자기 글이다.
    expect(ownPublishedExternalPostIds(data, rewrite)).toEqual(["3778"]);
    // 반대 방향도 같은 계보다.
    expect(ownPublishedExternalPostIds(data, original)).toEqual(["3778"]);
  });
});
