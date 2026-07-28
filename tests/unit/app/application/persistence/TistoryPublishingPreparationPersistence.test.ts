import { describe, expect, it } from "vitest";

import { mergeUserDataSnapshot } from "../../../../../app/application/persistence/mergeUserDataSnapshot";
import type { UserData } from "../../../../../app/user-flow/user-data";

const firstCategory = Object.freeze({
  publishingAccountId: "connection-1",
  id: "1038988",
  name: "건강정보",
});

function serverData(): UserData {
  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "밝은건강",
      description: "건강 정보",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T01:00:00.000Z",
      strategy: {
        primaryTopic: "건강정보",
        defaultPublishingAccountId: "connection-1",
        defaultTistoryCategory: firstCategory,
      },
    }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "건강 원고",
      status: "in_review",
      platform: "tistory",
      publishingAccountId: "connection-1",
      selectedPublishingAccountIds: ["connection-1"],
      publishingPreparation: {
        tistory: {
          publishingAccountId: "connection-1",
          platformCategoryId: "1038988",
          platformCategoryName: "건강정보",
          updatedAt: "2026-07-28T01:00:00.000Z",
        },
      },
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T01:00:00.000Z",
    }],
  } as unknown as UserData;
}

describe("Tistory publishing preparation persistence", () => {
  it("keeps the server-confirmed category when a newer client document snapshot omits publishing fields", () => {
    const current = serverData();
    const project = current.projects[0];
    const content = current.contents[0];
    const { defaultTistoryCategory: _defaultCategory, ...staleStrategy } = project.strategy!;
    const {
      publishingPreparation: _preparation,
      publishingAccountId: _account,
      selectedPublishingAccountIds: _selectedAccounts,
      platform: _platform,
      ...staleContent
    } = content;

    const merged = mergeUserDataSnapshot(current, {
      ...current,
      projects: [{
        ...project,
        strategy: staleStrategy,
        updatedAt: "2026-07-28T02:00:00.000Z",
      }],
      contents: [{
        ...staleContent,
        title: "수정된 건강 원고",
        updatedAt: "2026-07-28T02:00:00.000Z",
      }],
    });

    expect(merged.projects[0].strategy?.defaultTistoryCategory).toEqual(firstCategory);
    expect(merged.contents[0]).toMatchObject({
      platform: "tistory",
      publishingAccountId: "connection-1",
      selectedPublishingAccountIds: ["connection-1"],
      publishingPreparation: {
        tistory: {
          publishingAccountId: "connection-1",
          platformCategoryId: "1038988",
          platformCategoryName: "건강정보",
        },
      },
    });
    expect(merged.contents[0].title).toBe("수정된 건강 원고");
  });

  it("keeps the latest server category when a stale client carries a different category with a newer unrelated edit", () => {
    const current = serverData();
    const staleCategory = {
      publishingAccountId: "connection-1",
      id: "old-category",
      name: "이전 카테고리",
    };

    const merged = mergeUserDataSnapshot(current, {
      ...current,
      projects: [{
        ...current.projects[0],
        strategy: {
          ...current.projects[0].strategy,
          defaultTistoryCategory: staleCategory,
        },
        updatedAt: "2026-07-28T02:00:00.000Z",
      }],
      contents: [{
        ...current.contents[0],
        title: "다른 편집 내용",
        publishingPreparation: {
          tistory: {
            publishingAccountId: "connection-1",
            platformCategoryId: "old-category",
            platformCategoryName: "이전 카테고리",
            updatedAt: "2026-07-28T00:30:00.000Z",
          },
        },
        updatedAt: "2026-07-28T02:00:00.000Z",
      }],
    });

    expect(merged.projects[0].strategy?.defaultTistoryCategory).toEqual(firstCategory);
    expect(merged.contents[0].publishingPreparation?.tistory).toMatchObject({
      platformCategoryId: "1038988",
      platformCategoryName: "건강정보",
    });
  });

  it("accepts the first server category snapshot when no category was stored before", () => {
    const selected = serverData();
    const current = {
      ...selected,
      projects: selected.projects.map((project) => ({
        ...project,
        strategy: {
          ...project.strategy,
          defaultTistoryCategory: undefined,
        },
      })),
      contents: selected.contents.map((content) => {
        const { publishingPreparation: _preparation, ...withoutPreparation } = content;
        return withoutPreparation;
      }),
    } as UserData;

    const merged = mergeUserDataSnapshot(current, selected);

    expect(merged.projects[0].strategy?.defaultTistoryCategory).toEqual(firstCategory);
    expect(merged.contents[0].publishingPreparation?.tistory?.platformCategoryId).toBe("1038988");
  });
});
