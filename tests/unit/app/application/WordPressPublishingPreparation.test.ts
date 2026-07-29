import { describe, expect, it } from "vitest";

import { mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import {
  applyWordPressPublishingCategories,
  resolveWordPressCategorySelection,
} from "../../../../app/application/publishing/WordPressPublishingPreparation";
import {
  parseStoredUserData,
  resolveProjectStrategy,
  type UserData,
} from "../../../../app/user-flow/user-data";
import type { WordPressCategory, WordPressCategoryListResult } from "../../../../apps/wordpress";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

const CREATED_AT = "2026-07-29T00:00:00.000Z";
const BETWEEN_AT = "2026-07-29T00:30:00.000Z";
const UPDATED_AT = "2026-07-29T01:00:00.000Z";
const NEWER_AT = "2026-07-29T02:00:00.000Z";

const categories: readonly WordPressCategory[] = Object.freeze([
  category("12", "Household"),
  category("34", "Tax"),
  category("56", "Housing"),
]);

const connection: PlatformConnection = Object.freeze({
  id: "wordpress-1",
  workspaceId: "workspace-1",
  platform: "wordpress",
  displayName: "Example",
  status: "connected",
  publicMetadata: { siteUrl: "https://example.com", defaultCategoryIds: ["56"] },
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  lastVerifiedAt: CREATED_AT,
  selectedAsDefault: false,
  version: 1,
  automationPermissions: safeDraftPermissions,
  publishingPolicy: "review_first",
});

describe("WordPress publishing preparation", () => {
  it("reads legacy data without WordPress fields", () => {
    const legacy = baseData();
    expect(parseStoredUserData(JSON.stringify(legacy))).toEqual(legacy);
    expect(legacy.projects[0].strategy?.defaultWordPressCategories).toBeUndefined();
    expect(legacy.contents[0].publishingPreparation?.wordpress).toBeUndefined();
  });

  it("stores and restores multiple categories without overwriting Tistory preparation", () => {
    const otherConnectionPrepared = applyWordPressPublishingCategories(
      baseData(),
      "project-1",
      "content-1",
      "wordpress-2",
      ["56"],
      categoryResult("wordpress-2"),
      BETWEEN_AT,
    );
    const next = applyWordPressPublishingCategories(
      otherConnectionPrepared,
      "project-1",
      "content-1",
      connection.id,
      ["12", "34"],
      categoryResult(connection.id),
      UPDATED_AT,
    );
    const restored = parseStoredUserData(JSON.stringify(next));

    expect(restored.projects[0].strategy?.defaultWordPressCategories).toEqual([
      { publishingAccountId: "wordpress-2", id: "56", name: "Housing" },
      { publishingAccountId: connection.id, id: "12", name: "Household" },
      { publishingAccountId: connection.id, id: "34", name: "Tax" },
    ]);
    expect(restored.contents[0].publishingPreparation).toEqual({
      tistory: {
        publishingAccountId: "tistory-1",
        platformCategoryId: "77",
        platformCategoryName: "Existing Tistory",
        updatedAt: CREATED_AT,
      },
      wordpress: {
        publishingAccountId: connection.id,
        categoryIds: ["12", "34"],
        categoryNames: ["Household", "Tax"],
        updatedAt: UPDATED_AT,
      },
    });
  });

  it("preserves the existing Tistory Project defaults when WordPress categories are applied", () => {
    const data = baseData();
    const defaultTistoryCategory = {
      publishingAccountId: "tistory-1",
      id: "77",
      name: "Existing Tistory",
    } as const;
    const withTistoryDefaults: UserData = {
      ...data,
      projects: data.projects.map((project) => ({
        ...project,
        strategy: {
          ...resolveProjectStrategy(project),
          defaultPublishingAccountId: "tistory-1",
          defaultTistoryCategory,
        },
      })),
    };

    const next = applyWordPressPublishingCategories(
      withTistoryDefaults,
      "project-1",
      "content-1",
      connection.id,
      ["12"],
      categoryResult(connection.id),
      UPDATED_AT,
    );

    expect(next.projects[0].strategy?.defaultPublishingAccountId).toBe("tistory-1");
    expect(next.projects[0].strategy?.defaultTistoryCategory).toEqual(defaultTistoryCategory);
  });

  it("blocks category results read from a different WordPress connection", () => {
    const connectionB: PlatformConnection = Object.freeze({
      ...connection,
      id: "wordpress-b",
      displayName: "Site B",
      publicMetadata: { siteUrl: "https://site-b.example.com" },
    });
    const siteAResult = categoryResult("wordpress-a", [category("12", "Site A category")]);
    const siteBResult = categoryResult(connectionB.id, [category("12", "Site B category")]);

    expect(() => applyWordPressPublishingCategories(
      baseData(),
      "project-1",
      "content-1",
      connectionB.id,
      ["12"],
      siteAResult,
      UPDATED_AT,
    )).toThrow("different connection");

    const saved = applyWordPressPublishingCategories(
      baseData(),
      "project-1",
      "content-1",
      connectionB.id,
      ["12"],
      siteBResult,
      UPDATED_AT,
    );
    expect(resolve(saved, connectionB, siteAResult)).toEqual({
      valid: false,
      reason: "connection_mismatch",
      invalidCategoryIds: [],
    });
    expect(resolve(saved, connectionB, siteBResult)).toMatchObject({
      valid: true,
      source: "content",
      categoryIds: ["12"],
      categoryNames: ["Site B category"],
    });
  });

  it("uses Content, Project, and Connection category defaults in that order", () => {
    const saved = applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["12"], categoryResult(connection.id), UPDATED_AT,
    );
    const withDifferentProjectDefault: UserData = {
      ...saved,
      projects: saved.projects.map((project) => ({
        ...project,
        strategy: {
          ...project.strategy!,
          defaultWordPressCategories: [{ publishingAccountId: connection.id, id: "34", name: "Old name" }],
        },
      })),
    };

    expect(resolve(withDifferentProjectDefault)).toMatchObject({
      valid: true,
      source: "content",
      categoryIds: ["12"],
      categoryNames: ["Household"],
    });

    const withoutContentSelection: UserData = {
      ...withDifferentProjectDefault,
      contents: withDifferentProjectDefault.contents.map((content) => ({
        ...content,
        publishingPreparation: { tistory: content.publishingPreparation?.tistory },
      })),
    };
    expect(resolve(withoutContentSelection)).toMatchObject({
      valid: true,
      source: "project",
      categoryIds: ["34"],
      categoryNames: ["Tax"],
    });

    const withoutProjectSelection: UserData = {
      ...withoutContentSelection,
      projects: withoutContentSelection.projects.map((project) => ({
        ...project,
        strategy: { ...project.strategy!, defaultWordPressCategories: [] },
      })),
    };
    expect(resolve(withoutProjectSelection)).toMatchObject({
      valid: true,
      source: "connection",
      categoryIds: ["56"],
      categoryNames: ["Housing"],
    });
  });

  it("blocks a deleted higher-priority category instead of falling back", () => {
    const saved = applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["12"], categoryResult(connection.id), UPDATED_AT,
    );
    const deleted: UserData = {
      ...saved,
      contents: saved.contents.map((content) => ({
        ...content,
        publishingPreparation: {
          ...content.publishingPreparation,
          wordpress: {
            publishingAccountId: connection.id,
            categoryIds: ["deleted"],
            categoryNames: ["Deleted"],
            updatedAt: UPDATED_AT,
          },
        },
      })),
    };

    expect(resolve(deleted)).toEqual({
      valid: false,
      source: "content",
      reason: "invalid",
      invalidCategoryIds: ["deleted"],
    });
    expect(() => applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["deleted"], categoryResult(connection.id), UPDATED_AT,
    )).toThrow("no longer available");

    const deletedProjectDefault: UserData = {
      ...deleted,
      projects: deleted.projects.map((project) => ({
        ...project,
        strategy: {
          ...project.strategy!,
          defaultWordPressCategories: [{ publishingAccountId: connection.id, id: "deleted", name: "Deleted" }],
        },
      })),
      contents: deleted.contents.map((content) => ({
        ...content,
        publishingPreparation: { tistory: content.publishingPreparation?.tistory },
      })),
    };
    expect(resolve(deletedProjectDefault)).toEqual({
      valid: false,
      source: "project",
      reason: "invalid",
      invalidCategoryIds: ["deleted"],
    });
  });

  it("does not select Uncategorized or the first available category when no default exists", () => {
    const noDefaultConnection = { ...connection, publicMetadata: { siteUrl: "https://example.com" } };
    const result = resolveWordPressCategorySelection({
      project: baseData().projects[0],
      content: baseData().contents[0],
      connection: noDefaultConnection,
      categoryResult: categoryResult(noDefaultConnection.id, [category("1", "Uncategorized"), ...categories]),
    });

    expect(result).toEqual({ valid: false, reason: "missing", invalidCategoryIds: [] });
  });

  it("preserves server-confirmed WordPress and Tistory preparation from a stale snapshot", () => {
    const current = applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["12", "34"], categoryResult(connection.id), UPDATED_AT,
    );
    const stale = baseData();
    const incoming: UserData = {
      ...stale,
      projects: stale.projects.map((project) => ({ ...project, updatedAt: NEWER_AT })),
      contents: stale.contents.map((content) => ({ ...content, title: "Client edit", updatedAt: NEWER_AT })),
    };

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.projects[0].strategy?.defaultWordPressCategories).toEqual(
      current.projects[0].strategy?.defaultWordPressCategories,
    );
    expect(merged.contents[0].publishingPreparation).toEqual(current.contents[0].publishingPreparation);
    expect(merged.contents[0].title).toBe("Client edit");
  });
});

function resolve(
  data: UserData,
  selectedConnection: PlatformConnection = connection,
  result: WordPressCategoryListResult = categoryResult(selectedConnection.id),
) {
  return resolveWordPressCategorySelection({
    project: data.projects[0],
    content: data.contents[0],
    connection: selectedConnection,
    categoryResult: result,
  });
}

function category(id: string, name: string): WordPressCategory {
  return Object.freeze({
    id,
    platform: "wordpress",
    externalCategoryId: id,
    name,
    selectable: true,
  });
}

function categoryResult(
  platformConnectionId: string,
  values: readonly WordPressCategory[] = categories,
): WordPressCategoryListResult {
  return Object.freeze({
    platform: "wordpress",
    platformConnectionId,
    categories: Object.freeze([...values]),
    hasMore: false,
    retrievedAt: UPDATED_AT,
    warnings: Object.freeze([]),
  });
}

function baseData(): UserData {
  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Project",
      description: "",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "Content",
      body: "",
      status: "draft",
      updatedAt: CREATED_AT,
      publishingPreparation: {
        tistory: {
          publishingAccountId: "tistory-1",
          platformCategoryId: "77",
          platformCategoryName: "Existing Tistory",
          updatedAt: CREATED_AT,
        },
      },
    }],
    history: [],
    mediaMetadata: [],
    qualityReports: [],
    publishingRecords: [],
    scheduledPublishing: [],
  };
}
