import { describe, expect, it } from "vitest";

import { calculateWordPressDraftReadiness } from "../../../../../app/application/publishing/WordPressDraftReadiness";
import type { UserData } from "../../../../../app/user-flow/user-data";
import type { WordPressCategoryListResult } from "../../../../../apps/wordpress";
import { safeDraftPermissions, type PlatformConnection } from "../../../../../core/connections";
import type { ContentDocument } from "../../../../../core/content";
import { contentRevisionId, type QualityReport } from "../../../../../core/quality";

const NOW = "2026-07-29T00:00:00.000Z";

describe("WordPress Draft readiness", () => {
  it("passes ownership, target, current standard Quality, policy, Category, permissions, and final confirmation", () => {
    const context = baseContext();
    const readiness = calculate(context);
    expect(readiness.ready).toBe(true);
    expect(readiness.executable).toBe(true);
    expect(readiness.categorySelection).toMatchObject({ valid: true, categoryIds: ["12"] });
    expect(readiness.checks.every((check) => check.passed)).toBe(true);
  });

  it.each([
    ["Project", (context: ReturnType<typeof baseContext>) => ({ ...context, project: { ...context.project, workspaceId: "workspace-other" } })],
    ["Content Workspace", (context: ReturnType<typeof baseContext>) => ({ ...context, content: { ...context.content, workspaceId: "workspace-other" } })],
    ["Content Project", (context: ReturnType<typeof baseContext>) => ({ ...context, content: { ...context.content, projectId: "project-other" } })],
    ["Connection", (context: ReturnType<typeof baseContext>) => ({ ...context, connection: { ...context.connection, workspaceId: "workspace-other" } })],
  ])("blocks a mismatched %s owner", (_label, mutate) => {
    const readiness = calculate(mutate(baseContext()));
    expect(readiness.executable).toBe(false);
    expect(readiness.checks.some((check) => !check.passed)).toBe(true);
  });

  it("blocks a disabled platform, an unverified Connection, and an unselected target", () => {
    const context = baseContext();
    const disabledData: UserData = {
      ...context.data,
      workspace: {
        ...context.data.workspace!,
        settings: { ...context.data.workspace!.settings!, enabledPlatforms: [] },
      },
    };
    expect(check(calculate({ ...context, data: disabledData }), "wordpress_enabled")).toBe(false);
    expect(check(calculate({
      ...context,
      connection: { ...context.connection, lastVerifiedAt: undefined },
    }), "connection")).toBe(false);
    expect(check(calculate({ ...context, selectedTarget: false }), "selected_target")).toBe(false);
  });

  it("blocks a Category catalog from another Connection even when IDs overlap", () => {
    const context = baseContext();
    const readiness = calculate({
      ...context,
      categoryResult: categoryResult("wordpress-site-a"),
    });
    expect(readiness.categorySelection).toEqual({
      valid: false,
      reason: "connection_mismatch",
      invalidCategoryIds: [],
    });
    expect(check(readiness, "category_catalog")).toBe(false);
  });

  it("blocks a Category deleted immediately before execution without an automatic fallback", () => {
    const context = baseContext();
    const readiness = calculate({
      ...context,
      categoryResult: categoryResult(context.connection.id, [{
        id: "1",
        externalCategoryId: "1",
        platform: "wordpress",
        name: "Uncategorized",
        selectable: true,
      }]),
    });
    expect(readiness.categorySelection).toEqual({
      valid: false,
      source: "content",
      reason: "invalid",
      invalidCategoryIds: ["12"],
    });
    expect(check(readiness, "category_catalog")).toBe(false);
  });

  it("blocks stale Quality approval and missing final confirmation", () => {
    const context = baseContext();
    const staleQuality = { ...context.content.quality!, reviewedRevisionId: "rev-stale" };
    const readiness = calculate({
      ...context,
      content: { ...context.content, quality: staleQuality },
      finalConfirmation: false,
    });
    expect(check(readiness, "quality_revision")).toBe(false);
    expect(check(readiness, "final_confirmation")).toBe(false);
    expect(readiness.executable).toBe(false);
  });

  it("does not require media.upload for an image-free Draft", () => {
    const readiness = calculate(baseContext());
    expect(readiness.localImageCount).toBe(0);
    expect(check(readiness, "media_upload_permission")).toBe(true);
  });

  it("requires media.upload only when a local image is present", () => {
    const context = baseContext(imageDocument());
    const blocked = calculate({ ...context, mediaValidationPassed: true });
    expect(check(blocked, "media_upload_permission")).toBe(false);
    expect(blocked.executable).toBe(false);

    const allowedConnection = {
      ...context.connection,
      automationPermissions: [...safeDraftPermissions, "media.upload" as const],
    };
    const allowed = calculate({ ...context, connection: allowedConnection, mediaValidationPassed: true });
    expect(check(allowed, "media_upload_permission")).toBe(true);
    expect(allowed.executable).toBe(true);
  });

  it("requires both draft.create and draft.verify", () => {
    const context = baseContext();
    const connection = {
      ...context.connection,
      automationPermissions: safeDraftPermissions.filter((permission) => permission !== "draft.verify"),
    };
    const readiness = calculate({ ...context, connection });
    expect(check(readiness, "draft_create_permission")).toBe(true);
    expect(check(readiness, "draft_verify_permission")).toBe(false);
    expect(readiness.executable).toBe(false);
  });
});

function calculate(input: Parameters<typeof calculateWordPressDraftReadiness>[0]) {
  return calculateWordPressDraftReadiness(input);
}

function baseContext(document: ContentDocument = textDocument()) {
  const quality = approvedQuality(document);
  const project = {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Project",
    description: "",
    selectedPublishingAccountIds: ["wordpress-1"],
    createdAt: NOW,
    updatedAt: NOW,
  } as const;
  const content = {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: project.id,
    title: document.title,
    body: "",
    status: "ready" as const,
    updatedAt: NOW,
    platform: "wordpress",
    publishingAccountId: "wordpress-1",
    selectedPublishingAccountIds: ["wordpress-1"],
    document,
    quality,
    publishingPreparation: {
      wordpress: {
        publishingAccountId: "wordpress-1",
        categoryIds: ["12"],
        categoryNames: ["Household"],
        updatedAt: NOW,
      },
    },
  } as const;
  const data: UserData = {
    workspace: {
      id: "workspace-1",
      name: "Studio",
      settings: {
        enabledPlatforms: ["wordpress"],
        publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true },
        appearance: { theme: "system" },
      },
    },
    brands: [],
    projects: [project],
    contents: [content],
    history: [],
    mediaMetadata: [],
    qualityReports: [],
    publishingRecords: [],
    scheduledPublishing: [],
  };
  const connection: PlatformConnection = {
    id: "wordpress-1",
    workspaceId: "workspace-1",
    platform: "wordpress",
    displayName: "Example",
    status: "connected",
    publicMetadata: {
      siteUrl: "https://example.com",
      username: "editor",
      canCreateDrafts: true,
    },
    secretReference: "secret-reference",
    createdAt: NOW,
    updatedAt: NOW,
    lastVerifiedAt: NOW,
    selectedAsDefault: false,
    version: 1,
    automationPermissions: safeDraftPermissions,
    publishingPolicy: "review_first",
  };
  return {
    data,
    project,
    content,
    connection,
    categoryResult: categoryResult(connection.id),
    selectedTarget: true,
    finalConfirmation: true,
    mediaValidationPassed: false,
  };
}

function categoryResult(
  platformConnectionId: string,
  categories = [{
    id: "12",
    externalCategoryId: "12",
    platform: "wordpress" as const,
    name: "Household",
    selectable: true,
  }],
): WordPressCategoryListResult {
  return Object.freeze({
    platform: "wordpress",
    platformConnectionId,
    categories: Object.freeze(categories),
    hasMore: false,
    retrievedAt: NOW,
    warnings: Object.freeze([]),
  });
}

function textDocument(): ContentDocument {
  return Object.freeze({
    id: "document-1",
    title: "Approved WordPress Draft",
    blocks: Object.freeze([{ id: "paragraph-1", type: "paragraph" as const, text: "Meaningful approved body content." }]),
  });
}

function imageDocument(): ContentDocument {
  return Object.freeze({
    ...textDocument(),
    blocks: Object.freeze([
      ...textDocument().blocks,
      { id: "image-1", type: "image" as const, source: "/api/media/00000000-0000-0000-0000-000000000001.png", alt: "Local image", assetId: "asset-1" },
    ]),
  });
}

function approvedQuality(document: ContentDocument): QualityReport {
  return {
    approved: true,
    approvalType: "standard",
    approvalState: "approved",
    findings: [],
    overallScore: 100,
    reviews: [],
    dimensions: [],
    tasks: [],
    reviewedAt: NOW,
    reviewedRevisionId: contentRevisionId(document),
    weights: {} as QualityReport["weights"],
  };
}

function check(readiness: ReturnType<typeof calculateWordPressDraftReadiness>, key: string): boolean {
  return readiness.checks.find((item) => item.key === key)?.passed ?? false;
}
