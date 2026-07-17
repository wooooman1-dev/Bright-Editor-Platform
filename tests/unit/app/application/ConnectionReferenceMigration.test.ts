import { describe, expect, it } from "vitest";

import type { PlatformConnection } from "../../../../core/connections";
import {
  assertCompatibleConnectionReplacement,
  contentReferencesConnection,
  migrateConnectionReferences,
  projectReferencesConnection,
  replacementPublishingTarget,
} from "../../../../app/application/connections/ConnectionReferenceMigration";
import type { UserData } from "../../../../app/user-flow/user-data";

const sourceId = "connection-old";
const replacementId = "connection-new";
const updatedAt = "2026-07-18T02:00:00.000Z";

function connection(
  id: string,
  status: PlatformConnection["status"],
  blogId = "bright-healthy",
  sessionStateAvailable = status === "connected",
): PlatformConnection {
  return {
    id,
    workspaceId: "workspace-1",
    platform: "tistory",
    displayName: blogId,
    status,
    publicMetadata: { blogId, blogUrl: `https://${blogId}.tistory.com`, sessionStateAvailable },
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    selectedAsDefault: false,
    version: 1,
  };
}

function data(): UserData {
  return {
    workspace: { id: "workspace-1", name: "Workspace" },
    brands: [],
    projects: [
      {
        id: "project-1",
        workspaceId: "workspace-1",
        name: "Health",
        description: "",
        selectedPublishingAccountIds: [sourceId, replacementId],
        strategy: {
          primaryTopic: "건강",
          subtopics: [],
          excludedTopics: [],
          defaultContentType: "article",
          defaultPlatform: "tistory",
          targetLength: "4,500~6,000자",
          targetAudience: "일반 독자",
          tone: "친절함",
          internalLinkPolicy: "auto",
          relatedPostPolicy: "auto",
          ctaPolicy: "auto",
          imageStrategy: "auto",
          seoPolicy: "auto",
          defaultPublishingAccountId: sourceId,
          defaultTistoryCategory: {
            publishingAccountId: sourceId,
            id: "category-health",
            name: "건강정보",
          },
        },
        createdAt: "before",
        updatedAt: "before",
      },
      {
        id: "project-2",
        workspaceId: "workspace-1",
        name: "Unrelated",
        description: "",
        selectedPublishingAccountIds: ["connection-other"],
        createdAt: "before",
        updatedAt: "before",
      },
    ],
    contents: [
      {
        id: "content-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        title: "원고",
        body: "본문",
        status: "ready",
        updatedAt: "before",
        selectedPublishingAccountIds: [sourceId, replacementId],
        publishingAccountId: sourceId,
        publishingPreparation: {
          tistory: {
            publishingAccountId: sourceId,
            platformCategoryId: "category-health",
            platformCategoryName: "건강정보",
            updatedAt: "before",
          },
        },
      },
      {
        id: "content-2",
        workspaceId: "workspace-1",
        projectId: "project-2",
        title: "다른 원고",
        body: "다른 본문",
        status: "draft",
        updatedAt: "before",
        selectedPublishingAccountIds: ["connection-other"],
      },
    ],
    publishingRecords: [
      { id: "record-1", contentId: "content-1", platformConnectionId: sourceId, status: "failed", createdAt: "before" },
    ],
  };
}

describe("connection reference migration", () => {
  it("moves current Project, Content, category preparation, and default-account references without changing editorial data", () => {
    const source = data();
    const migration = migrateConnectionReferences(source, sourceId, replacementId, updatedAt);
    const project = migration.data.projects[0];
    const content = migration.data.contents[0];

    expect(migration.affectedProjectIds).toEqual(["project-1"]);
    expect(migration.affectedContentIds).toEqual(["content-1"]);
    expect(project.selectedPublishingAccountIds).toEqual([replacementId]);
    expect(project.strategy?.defaultPublishingAccountId).toBe(replacementId);
    expect(project.strategy?.defaultTistoryCategory).toEqual({
      publishingAccountId: replacementId,
      id: "category-health",
      name: "건강정보",
    });
    expect(content.selectedPublishingAccountIds).toEqual([replacementId]);
    expect(content.publishingAccountId).toBe(replacementId);
    expect(content.publishingPreparation?.tistory).toEqual({
      publishingAccountId: replacementId,
      platformCategoryId: "category-health",
      platformCategoryName: "건강정보",
      updatedAt,
    });
    expect(content.title).toBe("원고");
    expect(content.body).toBe("본문");
    expect(migration.data.projects[1]).toBe(source.projects[1]);
    expect(migration.data.contents[1]).toBe(source.contents[1]);
    expect(migration.data.publishingRecords).toBe(source.publishingRecords);
  });

  it("detects references stored only in defaults or publishing preparation", () => {
    const source = data();
    const project = {
      ...source.projects[0],
      selectedPublishingAccountIds: [],
      strategy: {
        ...source.projects[0].strategy!,
        defaultPublishingAccountId: sourceId,
      },
    };
    const content = {
      ...source.contents[0],
      selectedPublishingAccountIds: [],
      publishingAccountId: undefined,
    };

    expect(projectReferencesConnection(project, sourceId)).toBe(true);
    expect(contentReferencesConnection(content, sourceId)).toBe(true);
  });

  it("allows only a connected replacement for the same Workspace, platform, site, and verified session", () => {
    expect(() => assertCompatibleConnectionReplacement(
      connection(sourceId, "disconnected"),
      connection(replacementId, "connected"),
    )).not.toThrow();

    expect(() => assertCompatibleConnectionReplacement(
      connection(sourceId, "disconnected"),
      connection(replacementId, "connected", "another-blog"),
    )).toThrow("same publishing site");

    expect(() => assertCompatibleConnectionReplacement(
      connection(sourceId, "disconnected"),
      connection(replacementId, "disconnected"),
    )).toThrow("must be connected");

    expect(() => assertCompatibleConnectionReplacement(
      connection(sourceId, "disconnected"),
      connection(replacementId, "connected", "bright-healthy", false),
    )).toThrow("verified stored session");
  });

  it("creates a replacement Publishing Target for the affected Project", () => {
    expect(replacementPublishingTarget("project-1", connection(replacementId, "connected"), updatedAt)).toEqual({
      projectId: "project-1",
      platformConnectionId: replacementId,
      platform: "tistory",
      selectedAt: updatedAt,
    });
  });
});
