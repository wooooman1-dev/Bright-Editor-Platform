import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserData } from "../../../../app/user-flow/user-data";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";
import type { ContentDocument } from "../../../../core/content";
import { contentRevisionId, type QualityReport } from "../../../../core/quality";

const NOW = "2026-07-29T00:00:00.000Z";
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
  studioStore: { get: vi.fn(async () => userData()) },
}));

import { POST } from "../../../../app/api/publishing/wordpress/route";

describe("WordPress Draft publishing route", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ["missing action", {}],
    ["empty action", { action: "" }],
    ["unregistered action", { action: "publish" }],
  ])("blocks %s before executing the WordPress workflow", async (_label, action) => {
    const request = vi.spyOn(globalThis, "fetch");
    const response = await POST(createRequest(action));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("not registered") });
    expect(request).not.toHaveBeenCalled();
  });

  it("executes only create_draft through Category validation, Draft create, and external Post re-read", async () => {
    let postPayload: Record<string, unknown> | undefined;
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (resource, init) => {
      const url = String(resource);
      if (url.includes("/wp-json/wp/v2/categories")) {
        return new Response(JSON.stringify([{ id: 12, name: "Household" }]), {
          status: 200,
          headers: { "X-WP-TotalPages": "1" },
        });
      }
      if (url.endsWith("/wp-json/wp/v2/posts") && init?.method === "POST") {
        postPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: 501, status: "draft" }), { status: 201 });
      }
      if (url.endsWith("/wp-json/wp/v2/posts/501?context=edit")) {
        return new Response(JSON.stringify({
          id: 501,
          status: "draft",
          title: { raw: postPayload?.title },
          content: { raw: postPayload?.content },
          categories: postPayload?.categories,
          tags: [],
          featured_media: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const response = await POST(createRequest({ action: "create_draft" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { status: "verified", externalId: "501" },
    });
    expect(postPayload).toMatchObject({ status: "draft", categories: [12] });
    expect(postPayload).not.toHaveProperty("tags");
    expect(request).toHaveBeenCalledTimes(3);
  });
});

function createRequest(action: Readonly<Record<string, unknown>>): Request {
  return new Request("http://localhost/api/publishing/wordpress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...action,
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      connectionId: "wordpress-1",
      finalConfirmation: true,
    }),
  });
}

function userData(): UserData {
  const document = contentDocument();
  return {
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
      title: document.title,
      body: "",
      status: "ready",
      updatedAt: NOW,
      platform: "wordpress",
      publishingAccountId: "wordpress-1",
      selectedPublishingAccountIds: ["wordpress-1"],
      document,
      quality: approvedQuality(document),
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["12"],
          categoryNames: ["Household"],
          updatedAt: NOW,
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

function wordpressConnection(): PlatformConnection {
  return {
    id: "wordpress-1",
    workspaceId: "workspace-1",
    platform: "wordpress",
    displayName: "Example",
    status: "connected",
    publicMetadata: { siteUrl: "https://example.com", username: "editor", canCreateDrafts: true },
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

function contentDocument(): ContentDocument {
  return Object.freeze({
    id: "document-1",
    title: "Approved WordPress Draft",
    blocks: Object.freeze([{ id: "paragraph-1", type: "paragraph" as const, text: "Meaningful approved body content." }]),
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
