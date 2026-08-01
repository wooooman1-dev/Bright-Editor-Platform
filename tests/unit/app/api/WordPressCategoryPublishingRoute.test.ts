import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserData } from "../../../../app/user-flow/user-data";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

const NOW = "2026-07-29T00:00:00.000Z";
let persistedData: UserData;

vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: { findById: vi.fn(async () => wordpressConnection()) },
  secretStore: { readSecret: vi.fn(async () => "application-secret") },
  targetRepository: { listByProject: vi.fn(async () => [{
    projectId: "project-1",
    platformConnectionId: "wordpress-1",
    platform: "wordpress",
    selectedAt: NOW,
  }]) },
}));

vi.mock("../../../../app/application/studio-store", () => ({
  studioDataPath: "studio-data.json",
  studioStore: {
    get: vi.fn(async () => persistedData),
    update: vi.fn(async (
      _collection: string,
      _id: string,
      update: (current: UserData | undefined) => UserData,
    ) => {
      persistedData = update(persistedData);
      return persistedData;
    }),
  },
}));

import { GET, POST } from "../../../../app/api/publishing/wordpress/categories/route";

describe("WordPress Category publishing route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    persistedData = userData();
  });

  it("reads the selected WordPress target Category catalog with view context", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: 2, name: "생활재테크", parent: 0 }]), {
        status: 200,
        headers: { "X-WP-TotalPages": "1" },
      }),
    );

    const response = await GET(categoryRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      categories: [{ externalCategoryId: "2", name: "생활재테크" }],
      selection: { valid: false, reason: "missing" },
      preparation: null,
    });
    expect(request.mock.calls[0][0]).toBe(
      "https://example.com/wp-json/wp/v2/categories?context=view&page=1&per_page=100",
    );
  });

  it("persists a validated WordPress Category on the Project and Content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: 2, name: "생활재테크", parent: 0 }]), {
        status: 200,
        headers: { "X-WP-TotalPages": "1" },
      }),
    );

    const response = await POST(categorySelectionRequest(["2"]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      selection: {
        valid: true,
        categoryIds: ["2"],
        categoryNames: ["생활재테크"],
      },
      preparation: {
        publishingAccountId: "wordpress-1",
        categoryIds: ["2"],
        categoryNames: ["생활재테크"],
      },
    });
    expect(persistedData.contents[0].publishingPreparation?.wordpress).toMatchObject({
      publishingAccountId: "wordpress-1",
      categoryIds: ["2"],
      categoryNames: ["생활재테크"],
    });
    expect(persistedData.projects[0].strategy?.defaultWordPressCategories).toEqual([{
      publishingAccountId: "wordpress-1",
      id: "2",
      name: "생활재테크",
    }]);
  });

  it("rejects a Category ID that is not present in the current WordPress catalog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: 2, name: "생활재테크" }]), {
        status: 200,
        headers: { "X-WP-TotalPages": "1" },
      }),
    );

    const response = await POST(categorySelectionRequest(["999"]));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("no longer available"),
    });
    expect(persistedData.contents[0].publishingPreparation?.wordpress).toBeUndefined();
  });
});

function categoryRequest(): Request {
  return new Request(
    "http://localhost/api/publishing/wordpress/categories"
      + "?workspaceId=workspace-1"
      + "&projectId=project-1"
      + "&contentId=content-1"
      + "&connectionId=wordpress-1",
  );
}

function categorySelectionRequest(categoryIds: readonly string[]): Request {
  return new Request("http://localhost/api/publishing/wordpress/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      connectionId: "wordpress-1",
      categoryIds,
    }),
  });
}

function userData(): UserData {
  return {
    workspace: {
      id: "workspace-1",
      name: "Studio",
      settings: {
        enabledPlatforms: ["wordpress"],
        publishing: {
          reviewFirst: true,
          draftOnly: true,
          publicPublish: false,
          sequentialDraftSave: true,
          qualityApprovalRequired: true,
        },
        appearance: { theme: "system" },
      },
    },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Project",
      description: "",
      selectedPublishingAccountIds: ["wordpress-1"],
      createdAt: NOW,
      updatedAt: NOW,
    }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "WordPress Draft",
      body: "",
      status: "ready",
      updatedAt: NOW,
      platform: "wordpress",
      publishingAccountId: "wordpress-1",
      selectedPublishingAccountIds: ["wordpress-1"],
    }],
    history: [],
    mediaMetadata: [],
    qualityReports: [],
    publishingRecords: [],
    scheduledPublishing: [],
  };
}

function wordpressConnection(): PlatformConnection {
  return {
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
}
