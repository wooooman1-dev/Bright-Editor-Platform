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

  it("preserves independent review state and manual links when an applied Category changes", () => {
    const data = baseData();
    const quality = {
      approved: true,
      approvalType: "standard" as const,
      approvalState: "approved" as const,
      findings: [],
      overallScore: 100,
      reviews: [],
      dimensions: [],
      tasks: [],
      reviewedAt: CREATED_AT,
      reviewedRevisionId: "editorial-revision",
      weights: {} as never,
    };
    const reviewed: UserData = {
      ...data,
      contents: data.contents.map((content) => ({
        ...content,
        status: "ready" as const,
        quality,
        document: {
          id: "document-1",
          title: content.title,
          metadata: {
            buttonCount: 2,
            createdAt: CREATED_AT,
            generator: "test",
            imageCount: 0,
            language: "ko",
            readingTime: 1,
            source: "test",
            updatedAt: CREATED_AT,
            version: 1,
            videoCount: 0,
            wordCount: 10,
            internalLinkCatalogStatus: "evaluated",
            internalLinkCatalogContextKey: "old-context",
            availableRelatedContentCandidates: 1,
            approvalEvidence: { version: "1.0", status: "needs_review", sources: [] },
            approvalDuplicateCheck: {
              version: "1.0",
              status: "passed",
              checkedAt: CREATED_AT,
              comparedContentIds: [],
              reasons: [],
            },
            siteApprovalReadiness: { version: "1.0", status: "passed", checkedAt: CREATED_AT, checks: [] },
          },
          blocks: [
            { id: "body", type: "paragraph", text: "사용자 본문" },
            { id: "system-link", type: "button", ownership: "system_catalog", purpose: "internal_link", label: "자동 링크", targetUrl: "https://example.com/system" },
            { id: "manual-link", type: "button", ownership: "user_manual", purpose: "internal_link", label: "수동 링크", targetUrl: "https://example.com/manual" },
          ],
        },
      })),
      qualityReports: [{ contentId: "content-1", report: quality }],
    };
    const evidence = reviewed.contents[0].document?.metadata?.approvalEvidence;
    const duplicate = reviewed.contents[0].document?.metadata?.approvalDuplicateCheck;
    const actualCategories = categoryResult(connection.id, [category("2", "생활재테크")]);

    const applied = applyWordPressPublishingCategories(
      reviewed, "project-1", "content-1", connection.id, ["2"], actualCategories, UPDATED_AT,
    );
    const content = applied.contents[0];

    expect(content.status).toBe("ready");
    expect(content.quality).toBe(quality);
    expect(applied.qualityReports?.[0]?.report).toBe(quality);
    expect(content.document?.metadata?.approvalEvidence).toBe(evidence);
    expect(content.document?.metadata?.approvalDuplicateCheck).toBe(duplicate);
    expect(content.document?.metadata?.siteApprovalReadiness).toBeUndefined();
    expect(content.document?.metadata?.internalLinkCatalogStatus).toBeUndefined();
    expect(content.document?.blocks.map((block) => block.id)).toEqual(["body", "manual-link"]);
  });

  it("accepts the exact 생활재테크 Category returned as ID 2 by the current Connection", () => {
    const actualCategories = categoryResult(connection.id, [category("2", "생활재테크")]);
    const prepared = approvalData(applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["2"], actualCategories, UPDATED_AT,
    ));

    expect(resolve(prepared, connection, actualCategories)).toMatchObject({
      valid: true,
      source: "content",
      categoryIds: ["2"],
      categoryNames: ["생활재테크"],
      policyCompliant: true,
      requiredCategoryNames: ["생활재테크"],
    });
  });

  it("rejects 생활경제 even when its external ID is 2", () => {
    const actualCategories = categoryResult(connection.id, [category("2", "생활경제")]);
    const prepared = approvalData(applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["2"], actualCategories, UPDATED_AT,
    ));

    expect(resolve(prepared, connection, actualCategories)).toMatchObject({
      valid: true,
      source: "content",
      categoryIds: ["2"],
      categoryNames: ["생활경제"],
      policyCompliant: false,
      requiredCategoryNames: ["생활재테크"],
      policyReason: expect.stringContaining("정확한 일치"),
    });
  });

  it("accepts surrounding whitespace after safe Unicode normalization", () => {
    const normalizedVariant = ` ${"생활재테크".normalize("NFD")} `;
    const actualCategories = categoryResult(connection.id, [category("2", normalizedVariant)]);
    const prepared = approvalData(applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["2"], actualCategories, UPDATED_AT,
    ));

    expect(resolve(prepared, connection, actualCategories)).toMatchObject({
      valid: true,
      categoryIds: ["2"],
      categoryNames: [normalizedVariant],
      policyCompliant: true,
    });
  });

  it("does not collapse internal whitespace into a policy match", () => {
    const actualCategories = categoryResult(connection.id, [category("2", "생활 재테크")]);
    const prepared = approvalData(applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["2"], actualCategories, UPDATED_AT,
    ));

    expect(resolve(prepared, connection, actualCategories)).toMatchObject({
      valid: true,
      categoryNames: ["생활 재테크"],
      policyCompliant: false,
    });
  });

  it("uses the current Connection Category ID instead of depending on ID 2", () => {
    const actualCategories = categoryResult(connection.id, [category("17", "생활재테크")]);
    const prepared = approvalData(applyWordPressPublishingCategories(
      baseData(), "project-1", "content-1", connection.id, ["17"], actualCategories, UPDATED_AT,
    ));

    expect(resolve(prepared, connection, actualCategories)).toMatchObject({
      valid: true,
      source: "content",
      categoryIds: ["17"],
      categoryNames: ["생활재테크"],
      policyCompliant: true,
    });
  });

  it("keeps a Project default as a policy-matching proposal until Content applies it", () => {
    const actualCategories = categoryResult(connection.id, [category("2", "생활재테크")]);
    const data = approvalData(baseData());
    const proposed: UserData = {
      ...data,
      projects: data.projects.map((project) => ({
        ...project,
        strategy: {
          ...resolveProjectStrategy(project),
          defaultWordPressCategories: [{ publishingAccountId: connection.id, id: "2", name: "생활재테크" }],
        },
      })),
    };

    expect(resolve(proposed, connection, actualCategories)).toMatchObject({
      valid: true,
      source: "project",
      categoryIds: ["2"],
      categoryNames: ["생활재테크"],
      policyCompliant: true,
    });
    expect(proposed.contents[0].publishingPreparation?.wordpress).toBeUndefined();
  });

  it("does not let general 생활경제 topic text alter the exact Category policy", () => {
    const actualCategories = categoryResult(connection.id, [category("2", "생활재테크")]);
    const data = baseData();
    const topicData: UserData = {
      ...data,
      contents: data.contents.map((content) => ({
        ...content,
        title: "생활경제 정보를 설명하는 원고",
        body: "생활경제·재테크 콘텐츠라는 주제 표현은 Category 정책값이 아닙니다.",
      })),
    };
    const prepared = approvalData(applyWordPressPublishingCategories(
      topicData, "project-1", "content-1", connection.id, ["2"], actualCategories, UPDATED_AT,
    ));

    expect(resolve(prepared, connection, actualCategories)).toMatchObject({
      source: "content",
      categoryNames: ["생활재테크"],
      policyCompliant: true,
    });
    expect(prepared.contents[0].title).toContain("생활경제");
    expect(prepared.contents[0].body).toContain("생활경제·재테크");
  });

  it("requires 생활재테크 to be the only Category for the initial approval profile", () => {
    const policyCategories = categoryResult(connection.id, [
      category("12", "생활재테크"),
      category("34", "세금"),
    ]);
    const prepared = approvalData(applyWordPressPublishingCategories(
      baseData(),
      "project-1",
      "content-1",
      connection.id,
      ["12", "34"],
      policyCategories,
      UPDATED_AT,
    ));

    expect(resolve(prepared, connection, policyCategories)).toMatchObject({
      valid: true,
      categoryNames: ["생활재테크", "세금"],
      policyCompliant: false,
    });
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

function approvalData(data: UserData): UserData {
  return {
    ...data,
    contents: data.contents.map((content) => ({
      ...content,
      contentPurpose: "adsense_approval",
      approvalProfileId: "wordpress_life_economy_v1",
    }) as UserData["contents"][number]),
  };
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
