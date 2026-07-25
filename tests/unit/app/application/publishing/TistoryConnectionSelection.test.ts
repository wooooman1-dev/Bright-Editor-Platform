import { describe, expect, it } from "vitest";

import { resolveTistoryConnectionId } from "../../../../../app/application/publishing/TistoryConnectionSelection";
import type { UserData } from "../../../../../app/user-flow/user-data";

describe("TistoryConnectionSelection", () => {
  it("hydrates missing Content preparation from the matching Project default category", () => {
    const data: UserData = {
      workspace: { id: "workspace-1", name: "Studio" },
      brands: [],
      projects: [{
        id: "project-1",
        workspaceId: "workspace-1",
        name: "Health",
        description: "",
        selectedPublishingAccountIds: ["connection-1"],
        strategy: {
          primaryTopic: "건강정보",
          subtopics: [],
          excludedTopics: [],
          defaultContentType: "Google SEO 장문 블로그",
          defaultPlatform: "tistory",
          targetLength: "4,500~6,000자",
          targetAudience: "일반 독자",
          tone: "친절하고 신뢰할 수 있는 설명",
          internalLinkPolicy: "본문 중간 실제 공개 글 1개 자동 배치",
          relatedPostPolicy: "문서 마지막 실제 공개 글 최대 3개 자동 배치",
          ctaPolicy: "필요한 경우 최대 1~2개",
          imageStrategy: "설명 이미지",
          seoPolicy: "Helpful · Reliable · People-first",
          defaultPublishingAccountId: "connection-1",
          defaultTistoryCategory: {
            publishingAccountId: "connection-1",
            id: "1038988",
            name: "건강정보",
          },
        },
        createdAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T01:00:00.000Z",
      }],
      contents: [{
        id: "content-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        title: "잠을 자도 피곤한 이유",
        body: "",
        status: "draft",
        selectedPublishingAccountIds: ["connection-1"],
        publishingAccountId: "connection-1",
        updatedAt: "2026-07-24T02:00:00.000Z",
      }],
    };

    const content = data.contents[0];
    expect(resolveTistoryConnectionId(data, content)).toBe("connection-1");
    expect(content.publishingPreparation?.tistory).toEqual({
      publishingAccountId: "connection-1",
      platformCategoryId: "1038988",
      platformCategoryName: "건강정보",
      updatedAt: "2026-07-24T01:00:00.000Z",
    });
  });

  it("does not copy a Project category from a different publishing account", () => {
    const data: UserData = {
      workspace: { id: "workspace-1", name: "Studio" },
      brands: [],
      projects: [{
        id: "project-1",
        workspaceId: "workspace-1",
        name: "Health",
        description: "",
        selectedPublishingAccountIds: ["connection-2"],
        strategy: {
          primaryTopic: "건강정보",
          subtopics: [],
          excludedTopics: [],
          defaultContentType: "article",
          defaultPlatform: "tistory",
          targetLength: "4,500~6,000자",
          targetAudience: "일반 독자",
          tone: "친절한 설명",
          internalLinkPolicy: "자동 배치",
          relatedPostPolicy: "자동 배치",
          ctaPolicy: "선택",
          imageStrategy: "설명 이미지",
          seoPolicy: "people-first",
          defaultPublishingAccountId: "connection-2",
          defaultTistoryCategory: {
            publishingAccountId: "connection-1",
            id: "1038988",
            name: "건강정보",
          },
        },
        createdAt: "now",
        updatedAt: "now",
      }],
      contents: [{
        id: "content-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        title: "Draft",
        body: "",
        status: "draft",
        publishingAccountId: "connection-2",
        updatedAt: "now",
      }],
    };

    const content = data.contents[0];
    expect(resolveTistoryConnectionId(data, content)).toBe("connection-2");
    expect(content.publishingPreparation).toBeUndefined();
  });
});
