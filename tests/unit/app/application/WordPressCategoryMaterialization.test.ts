import { describe, expect, it } from "vitest";

import {
  materializeWordPressCategorySelection,
  resolveWordPressCategorySelection,
} from "../../../../app/application/publishing/WordPressPublishingPreparation";
import type { UserData } from "../../../../app/user-flow/user-data";
import type { WordPressCategoryListResult } from "../../../../apps/wordpress";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

const connection: PlatformConnection = Object.freeze({
  id: "wordpress-1",
  workspaceId: "workspace-1",
  platform: "wordpress",
  displayName: "WordPress",
  status: "connected",
  publicMetadata: { siteUrl: "https://example.com", defaultCategoryIds: ["34"] },
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  lastVerifiedAt: "2026-08-02T00:00:00.000Z",
  selectedAsDefault: false,
  version: 1,
  automationPermissions: safeDraftPermissions,
  publishingPolicy: "review_first",
});

const catalog: WordPressCategoryListResult = Object.freeze({
  platform: "wordpress",
  platformConnectionId: connection.id,
  categories: Object.freeze([
    Object.freeze({ id: "12", platform: "wordpress", externalCategoryId: "12", name: "생활재테크", slug: "life", selectable: true }),
    Object.freeze({ id: "34", platform: "wordpress", externalCategoryId: "34", name: "금융상식", slug: "finance", selectable: true }),
  ]),
  hasMore: false,
  warnings: Object.freeze([]),
  retrievedAt: "2026-08-02T00:00:00.000Z",
});

function data(): UserData {
  return {
    workspace: { id: "workspace-1", name: "Studio", createdAt: "now", updatedAt: "now" },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Project",
      description: "",
      selectedPublishingAccountIds: [connection.id],
      createdAt: "now",
      updatedAt: "now",
      strategy: {
        primaryTopic: "생활경제",
        subtopics: [],
        excludedTopics: [],
        defaultContentType: "article",
        defaultPlatform: "wordpress",
        targetAudience: "독자",
        tone: "존댓말",
        internalLinkPolicy: "helpful",
        relatedPostPolicy: "helpful",
        ctaPolicy: "when_useful",
        imageStrategy: "purposeful",
        seoPolicy: "people_first",
        defaultWordPressCategories: [{ publishingAccountId: connection.id, id: "12", name: "생활재테크" }],
      },
    }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "원고",
      body: "",
      status: "draft",
      contentType: "article",
      platform: "wordpress",
      primaryKeyword: "리볼빙",
      publishingAccountId: connection.id,
      selectedPublishingAccountIds: [connection.id],
      updatedAt: "now",
    }],
    history: [],
  } as UserData;
}

describe("WordPress inherited Category materialization", () => {
  it("automatically applies the Project default to Content", () => {
    const result = materializeWordPressCategorySelection({
      data: data(),
      projectId: "project-1",
      contentId: "content-1",
      connection,
      categoryResult: catalog,
      updatedAt: "2026-08-02T01:00:00.000Z",
    });
    expect(result.applied).toBe(true);
    expect(result.selection).toMatchObject({ valid: true, source: "content", categoryIds: ["12"], categoryNames: ["생활재테크"] });
    expect(result.data.contents[0].publishingPreparation?.wordpress).toMatchObject({
      publishingAccountId: connection.id,
      categoryIds: ["12"],
      categoryNames: ["생활재테크"],
    });
  });

  it("does not rewrite an already applied Content selection", () => {
    const first = materializeWordPressCategorySelection({
      data: data(), projectId: "project-1", contentId: "content-1", connection, categoryResult: catalog, updatedAt: "first",
    });
    const second = materializeWordPressCategorySelection({
      data: first.data, projectId: "project-1", contentId: "content-1", connection, categoryResult: catalog, updatedAt: "second",
    });
    expect(second.applied).toBe(false);
    expect(second.data).toBe(first.data);
  });

  it("leaves an invalid inherited Category unresolved instead of guessing", () => {
    const current = data();
    const invalidData: UserData = {
      ...current,
      projects: current.projects.map((project) => project.id === "project-1" ? {
        ...project,
        strategy: { ...project.strategy!, defaultWordPressCategories: [{ publishingAccountId: connection.id, id: "999", name: "삭제됨" }] },
      } : project),
    };
    const result = materializeWordPressCategorySelection({
      data: invalidData, projectId: "project-1", contentId: "content-1", connection, categoryResult: catalog, updatedAt: "now",
    });
    expect(result.applied).toBe(false);
    expect(result.selection).toMatchObject({ valid: false, reason: "invalid", invalidCategoryIds: ["999"] });
    expect(resolveWordPressCategorySelection({ project: result.data.projects[0], content: result.data.contents[0], connection, categoryResult: catalog })).toEqual(result.selection);
  });
});
