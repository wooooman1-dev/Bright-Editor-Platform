import { afterEach, describe, expect, it, vi } from "vitest";

import { WordPressDraftApplicationService } from "../../../../../app/application/publishing/WordPressDraftApplicationService";
import type { UserData } from "../../../../../app/user-flow/user-data";
import {
  WordPressDraftCreateUncertainError,
  WordPressDraftPublishingAdapter,
  WordPressMediaUploadUncertainError,
  type WordPressCategoryListResult,
  type WordPressDraftPayload,
  type WordPressMediaUploadInput,
} from "../../../../../apps/wordpress";
import { safeDraftPermissions, type PlatformConnection } from "../../../../../core/connections";
import type { ContentDocument } from "../../../../../core/content";
import type { MediaAsset } from "../../../../../core/media";
import { contentRevisionId, type QualityReport } from "../../../../../core/quality";
import { PublishingPermissionGate } from "../../../../../core/publishing";

const NOW = "2026-07-29T00:00:00.000Z";
const SECRET = "must-not-leak";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(() => vi.restoreAllMocks());

describe("WordPress Draft application service", () => {
  it("creates and externally verifies an image-free Draft without media.upload permission", async () => {
    const harness = createHarness(textDocument());
    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result.status).toBe("verified");
    expect(result.externalId).toBe("501");
    expect(result.cleanupRequired).toBe(false);
    expect(harness.media.uploadMedia).not.toHaveBeenCalled();
    expect(harness.drafts.createDraft).toHaveBeenCalledOnce();
    expect(harness.drafts.readDraft).toHaveBeenCalledOnce();
    expect(harness.categories.listAllCategories).toHaveBeenCalledOnce();
  });

  it("uploads media, replaces local URLs, stores and re-reads ALT, and assigns only the selected Featured Image", async () => {
    const harness = createHarness(imageDocument(), { featuredImageAssetId: "asset-1", mediaPermission: true });
    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result.status).toBe("verified");
    expect(harness.media.uploadMedia).toHaveBeenCalledOnce();
    expect(harness.media.storeAlt).toHaveBeenCalledWith(expect.objectContaining({ externalMediaId: "91", alt: "Canonical ALT" }));
    expect(harness.media.readMedia).toHaveBeenCalledWith(expect.objectContaining({ externalMediaId: "91" }));
    const payload = harness.createdPayload();
    expect(payload.content).toContain("https://example.com/uploads/asset-1.png");
    expect(payload.content).not.toContain("/api/media/");
    expect(payload.featuredMediaId).toBe("91");
    expect(payload.status).toBe("draft");
    expect(payload).not.toHaveProperty("tags");
    expect(harness.data.contents[0].document?.blocks[1]).toMatchObject({ source: localSource(1) });
    expect(harness.categories.listAllCategories).toHaveBeenCalledTimes(2);
  });

  it("blocks deterministic HTML integrity failures before any external Media write", async () => {
    const base = imageDocument();
    const document: ContentDocument = {
      ...base,
      blocks: [
        { id: "raw-source", type: "paragraph", text: "공식 자료 (fsc.go.kr)" },
        ...base.blocks,
      ],
    };
    const harness = createHarness(document, { mediaPermission: true });

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result).toMatchObject({
      status: "failed",
      stage: "draft_create",
      record: { safeErrorCode: "HTML_INTEGRITY_BLOCKED" },
    });
    expect(harness.media.uploadMedia).not.toHaveBeenCalled();
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
  });

  it("re-reads Categories after verified Media and blocks a deleted selection before Post creation", async () => {
    const harness = createHarness(imageDocument(), { mediaPermission: true });
    harness.categories.listAllCategories
      .mockResolvedValueOnce(categoryResult(harness.connection.id))
      .mockResolvedValueOnce(categoryResult(harness.connection.id, [{
        id: "1",
        externalCategoryId: "1",
        platform: "wordpress",
        name: "Uncategorized",
        selectable: true,
      }]));

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result).toMatchObject({ status: "cleanup_required", stage: "readiness", cleanupRequired: true });
    expect(result.uploadedMedia).toMatchObject([{ externalMediaId: "91", verified: true }]);
    expect(harness.categories.listAllCategories).toHaveBeenCalledTimes(2);
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
  });

  it("passes the actual final confirmation through each execution-time Permission Gate", async () => {
    const authorize = vi.spyOn(PublishingPermissionGate.prototype, "authorize");
    const harness = createHarness(imageDocument(), { mediaPermission: true });

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result.status).toBe("verified");
    for (const workflow of ["media.upload", "draft.create", "draft.verify"] as const) {
      expect(authorize.mock.calls.some(([request]) => request.workflow === workflow && request.finalConfirmation === true)).toBe(true);
    }
  });

  it("does not choose a Featured Image when featuredImageAssetId is absent", async () => {
    const harness = createHarness(imageDocument(), { mediaPermission: true });
    const result = await harness.service.execute(execution(harness.data, harness.connection));
    expect(result.status).toBe("verified");
    expect(harness.createdPayload()).not.toHaveProperty("featuredMediaId");
  });

  it("requires final confirmation and fresh same-Connection Categories before creating a Post", async () => {
    const noConfirmation = createHarness(textDocument());
    const blocked = await noConfirmation.service.execute({
      ...execution(noConfirmation.data, noConfirmation.connection),
      finalConfirmation: false,
    });
    expect(blocked.status).toBe("failed");
    expect(blocked.stage).toBe("readiness");
    expect(noConfirmation.drafts.createDraft).not.toHaveBeenCalled();

    const wrongConnection = createHarness(textDocument(), { categoryConnectionId: "wordpress-site-a" });
    const mismatch = await wrongConnection.service.execute(execution(wrongConnection.data, wrongConnection.connection));
    expect(mismatch.status).toBe("failed");
    expect(wrongConnection.drafts.createDraft).not.toHaveBeenCalled();

    const deleted = createHarness(textDocument(), { categories: [{
      id: "1",
      externalCategoryId: "1",
      platform: "wordpress",
      name: "Uncategorized",
      selectable: true,
    }] });
    const deletedResult = await deleted.service.execute(execution(deleted.data, deleted.connection));
    expect(deletedResult.status).toBe("failed");
    expect(deleted.drafts.createDraft).not.toHaveBeenCalled();
  });

  it("stops before Post creation when a later Media upload fails and preserves cleanup state", async () => {
    const harness = createHarness(twoImageDocument(), { mediaPermission: true });
    harness.media.uploadMedia
      .mockResolvedValueOnce({ externalMediaId: "91", sourceUrl: "https://example.com/uploads/asset-1.png" })
      .mockRejectedValueOnce(new Error("second upload failed"));

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result).toMatchObject({ status: "cleanup_required", stage: "media", cleanupRequired: true });
    expect(result.uploadedMedia).toHaveLength(1);
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
  });

  it("does not delete uploaded Media when Post creation fails", async () => {
    const harness = createHarness(imageDocument(), { mediaPermission: true });
    harness.drafts.createDraft.mockRejectedValueOnce(new Error("post failure"));

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result).toMatchObject({ status: "cleanup_required", stage: "draft_create", cleanupRequired: true });
    expect(result.uploadedMedia).toHaveLength(1);
    expect(harness.media).not.toHaveProperty("deleteMedia");
  });

  it("preserves the external Post ID and blocks completion when re-read verification mismatches", async () => {
    const harness = createHarness(textDocument());
    harness.drafts.verifyDraft.mockReturnValueOnce({
      verified: false,
      checks: [{ key: "title", passed: false }],
    });

    const result = await harness.service.execute(execution(harness.data, harness.connection));
    harness.categories.listAllCategories.mockClear().mockRejectedValue(new Error("WordPress unavailable"));
    harness.secrets.readSecret.mockClear().mockRejectedValue(new Error("SecretStore unavailable"));
    harness.drafts.createDraft.mockClear();
    harness.drafts.readDraft.mockClear();
    harness.drafts.verifyDraft.mockClear();
    const duplicate = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result).toMatchObject({
      status: "verification_failed",
      stage: "draft_verify",
      externalId: "501",
      record: { externalPostId: "501", status: "verification_failed" },
    });
    expect(duplicate).toMatchObject({
      status: "verification_failed",
      duplicateBlocked: true,
      externalId: "501",
      verification: { verified: false, checks: [{ key: "title", passed: false }] },
    });
    expect(harness.categories.listAllCategories).not.toHaveBeenCalled();
    expect(harness.secrets.readSecret).not.toHaveBeenCalled();
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
    expect(harness.drafts.readDraft).not.toHaveBeenCalled();
    expect(harness.drafts.verifyDraft).not.toHaveBeenCalled();
  });

  it("persists unknown_result with the external Post ID when re-read cannot finish", async () => {
    const harness = createHarness(textDocument());
    harness.drafts.readDraft.mockRejectedValueOnce(new Error("network interrupted"));

    const result = await harness.service.execute(execution(harness.data, harness.connection));
    harness.categories.listAllCategories.mockClear().mockRejectedValue(new Error("WordPress unavailable"));
    harness.secrets.readSecret.mockClear().mockRejectedValue(new Error("SecretStore unavailable"));
    harness.drafts.createDraft.mockClear();
    harness.drafts.readDraft.mockClear();

    expect(result).toMatchObject({
      status: "unknown_result",
      externalId: "501",
      record: { status: "unknown_result", externalPostId: "501" },
    });
    expect(await harness.service.execute(execution(harness.data, harness.connection))).toMatchObject({
      status: "unknown_result",
      duplicateBlocked: true,
      externalId: "501",
    });
    expect(harness.categories.listAllCategories).not.toHaveBeenCalled();
    expect(harness.secrets.readSecret).not.toHaveBeenCalled();
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
    expect(harness.drafts.readDraft).not.toHaveBeenCalled();
  });

  it("reuses a verified result before SecretStore or Category access even when WordPress is unavailable", async () => {
    const harness = createHarness(textDocument());
    const first = await harness.service.execute(execution(harness.data, harness.connection));
    harness.categories.listAllCategories.mockClear().mockRejectedValue(new Error("WordPress unavailable"));
    harness.secrets.readSecret.mockClear().mockRejectedValue(new Error("SecretStore unavailable"));
    harness.drafts.createDraft.mockClear();
    const second = await harness.service.execute(execution(harness.data, harness.connection));

    expect(first.status).toBe("verified");
    expect(second).toMatchObject({ status: "verified", reused: true, duplicateBlocked: false, externalId: "501" });
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(harness.categories.listAllCategories).not.toHaveBeenCalled();
    expect(harness.secrets.readSecret).not.toHaveBeenCalled();
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
  });

  it("blocks an in-progress duplicate at the Application Service boundary", async () => {
    const harness = createHarness(textDocument());
    let release!: () => void;
    const createDraft = harness.drafts.createDraft.getMockImplementation()!;
    harness.drafts.createDraft.mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return createDraft(input);
    });

    const first = harness.service.execute(execution(harness.data, harness.connection));
    await vi.waitFor(() => expect(harness.drafts.createDraft).toHaveBeenCalledOnce());
    const duplicate = await harness.service.execute(execution(harness.data, harness.connection));

    expect(duplicate).toMatchObject({ status: "in_progress", duplicateBlocked: true });
    expect(harness.drafts.createDraft).toHaveBeenCalledOnce();
    expect(harness.categories.listAllCategories).toHaveBeenCalledOnce();
    expect(harness.secrets.readSecret).toHaveBeenCalledOnce();
    release();
    await expect(first).resolves.toMatchObject({ status: "verified" });
  });

  it("keeps the atomic claim when two new requests finish preparation concurrently", async () => {
    const harness = createHarness(textDocument());
    let preparedCount = 0;
    let releasePreparation!: () => void;
    const preparationBarrier = new Promise<void>((resolve) => { releasePreparation = resolve; });
    harness.categories.listAllCategories.mockImplementation(async () => {
      preparedCount += 1;
      if (preparedCount === 2) releasePreparation();
      await preparationBarrier;
      return categoryResult(harness.connection.id);
    });

    const results = await Promise.all([
      harness.service.execute(execution(harness.data, harness.connection)),
      harness.service.execute(execution(harness.data, harness.connection)),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["in_progress", "verified"]);
    expect(results.find((result) => result.status === "in_progress")).toMatchObject({ duplicateBlocked: true });
    expect(harness.categories.listAllCategories).toHaveBeenCalledTimes(2);
    expect(harness.secrets.readSecret).toHaveBeenCalledTimes(2);
    expect(harness.drafts.createDraft).toHaveBeenCalledOnce();
  });

  it("uses a new Idempotency Key after the canonical Content Revision changes", async () => {
    const harness = createHarness(textDocument());
    const first = await harness.service.execute(execution(harness.data, harness.connection));
    const changedDocument = Object.freeze({
      ...textDocument(),
      blocks: Object.freeze([{ id: "paragraph-1", type: "paragraph" as const, text: "A different approved revision." }]),
    });
    const changedData: UserData = {
      ...harness.data,
      contents: [{
        ...harness.data.contents[0],
        document: changedDocument,
        quality: approvedQuality(changedDocument),
      }],
    };
    const second = await harness.service.execute(execution(changedData, harness.connection));

    expect(second.status).toBe("verified");
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(harness.drafts.createDraft).toHaveBeenCalledTimes(2);
  });

  it("uses a new Idempotency Key for another WordPress Connection", async () => {
    const harness = createHarness(textDocument());
    const first = await harness.service.execute(execution(harness.data, harness.connection));
    const connection = { ...harness.connection, id: "wordpress-2", displayName: "Second site" };
    const data: UserData = {
      ...harness.data,
      projects: [{ ...harness.data.projects[0], selectedPublishingAccountIds: ["wordpress-2"] }],
      contents: [{
        ...harness.data.contents[0],
        publishingAccountId: "wordpress-2",
        selectedPublishingAccountIds: ["wordpress-2"],
        publishingPreparation: {
          ...harness.data.contents[0].publishingPreparation,
          wordpress: {
            publishingAccountId: "wordpress-2",
            categoryIds: ["12"],
            categoryNames: ["Household"],
            updatedAt: NOW,
          },
        },
      }],
    };
    harness.categories.listAllCategories.mockResolvedValue(categoryResult(connection.id));

    const second = await harness.service.execute(execution(data, connection));

    expect(second.status).toBe("verified");
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(harness.drafts.createDraft).toHaveBeenCalledTimes(2);
  });

  it("blocks automatic recreation after verification_failed or unknown_result", async () => {
    const mismatch = createHarness(textDocument());
    mismatch.drafts.verifyDraft.mockReturnValueOnce({ verified: false, checks: [{ key: "title", passed: false }] });
    expect((await mismatch.service.execute(execution(mismatch.data, mismatch.connection))).status).toBe("verification_failed");
    expect(await mismatch.service.execute(execution(mismatch.data, mismatch.connection))).toMatchObject({
      status: "verification_failed",
      duplicateBlocked: true,
    });
    expect(mismatch.drafts.createDraft).toHaveBeenCalledOnce();

    const uncertain = createHarness(textDocument());
    uncertain.drafts.createDraft.mockRejectedValueOnce(new WordPressDraftCreateUncertainError());
    const unknown = await uncertain.service.execute(execution(uncertain.data, uncertain.connection));
    expect(unknown).toMatchObject({ status: "unknown_result", record: { status: "unknown_result" } });
    expect(await uncertain.service.execute(execution(uncertain.data, uncertain.connection))).toMatchObject({
      status: "unknown_result",
      duplicateBlocked: true,
    });
    expect(uncertain.drafts.createDraft).toHaveBeenCalledOnce();
  });

  it("persists cleanup_required with only safe Media identifiers after a partial Media failure", async () => {
    const harness = createHarness(twoImageDocument(), { mediaPermission: true });
    harness.media.uploadMedia
      .mockResolvedValueOnce({ externalMediaId: "91", sourceUrl: "https://example.com/uploads/asset-1.png" })
      .mockRejectedValueOnce(new Error(`${SECRET} Authorization: Basic hidden`));

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result.record).toMatchObject({
      status: "cleanup_required",
      cleanupRequired: true,
      uploadedMedia: [{ assetId: "asset-1", externalMediaId: "91" }],
    });
    expect(JSON.stringify(result.record)).not.toContain(SECRET);
    expect(JSON.stringify(result.record)).not.toContain("Authorization");
  });

  it("persists an uncertain first Media upload as unknown_result and never creates a Draft", async () => {
    const harness = createHarness(imageDocument(), { mediaPermission: true });
    harness.media.uploadMedia.mockRejectedValueOnce(new WordPressMediaUploadUncertainError());

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result).toMatchObject({
      status: "unknown_result",
      stage: "media",
      cleanupRequired: true,
      record: { status: "unknown_result", stage: "media", cleanupRequired: true, uploadedMedia: [] },
    });
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
    expect(await harness.service.execute(execution(harness.data, harness.connection))).toMatchObject({
      status: "unknown_result",
      duplicateBlocked: true,
    });
    expect(harness.media.uploadMedia).toHaveBeenCalledOnce();
  });

  it("preserves confirmed Media IDs when a later Media upload result is uncertain", async () => {
    const harness = createHarness(twoImageDocument(), { mediaPermission: true });
    harness.media.uploadMedia
      .mockResolvedValueOnce({ externalMediaId: "91", sourceUrl: "https://example.com/uploads/asset-1.png" })
      .mockRejectedValueOnce(new WordPressMediaUploadUncertainError());

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(result.record).toMatchObject({
      status: "unknown_result",
      stage: "media",
      uploadedMedia: [{ assetId: "asset-1", externalMediaId: "91" }],
    });
    expect(harness.drafts.createDraft).not.toHaveBeenCalled();
    const audit = JSON.stringify(result.record);
    expect(audit).not.toContain(SECRET);
    expect(audit).not.toContain("Authorization");
    expect(audit).not.toContain(Buffer.from(PNG).toString("base64"));
    expect(audit).not.toContain("137,80,78,71");
  });

  it("does not expose the secret or Authorization header in failures or logs", async () => {
    const authorization = `Basic ${Buffer.from(`editor:${SECRET}`).toString("base64")}`;
    const harness = createHarness(textDocument());
    harness.categories.listAllCategories.mockRejectedValueOnce(new Error(`${SECRET} ${authorization}`));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await harness.service.execute(execution(harness.data, harness.connection));

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(authorization);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });
});

function createHarness(document: ContentDocument, options: Readonly<{
  featuredImageAssetId?: string;
  mediaPermission?: boolean;
  categoryConnectionId?: string;
  categories?: WordPressCategoryListResult["categories"];
}> = {}) {
  const data = baseData(document, options.featuredImageAssetId);
  const connection = baseConnection(options.mediaPermission);
  const categories = {
    listAllCategories: vi.fn(async () => categoryResult(
      options.categoryConnectionId ?? connection.id,
      options.categories,
    )),
  };
  const media = {
    uploadMedia: vi.fn(async (input: WordPressMediaUploadInput & Readonly<{ assetId?: string }>) => {
      const assetId = input.assetId ?? "asset-1";
      const index = assetId.endsWith("2") ? "92" : "91";
      return { externalMediaId: index, sourceUrl: `https://example.com/uploads/${assetId}.png` };
    }),
    storeAlt: vi.fn(async () => undefined),
    readMedia: vi.fn(async (input: Readonly<{ externalMediaId: string }>) => ({
      externalMediaId: input.externalMediaId,
      sourceUrl: `https://example.com/uploads/asset-${input.externalMediaId === "92" ? "2" : "1"}.png`,
      alt: input.externalMediaId === "92" ? "Second ALT" : "Canonical ALT",
    })),
    verifyMedia: vi.fn((actual, expected) => {
      if (actual.externalMediaId !== expected.externalMediaId
        || actual.sourceUrl !== expected.sourceUrl
        || actual.alt !== expected.alt) throw new Error("media mismatch");
      return actual;
    }),
  };
  let payload: WordPressDraftPayload | undefined;
  const verifier = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());
  const drafts = {
    prepare: vi.fn((request) => verifier.prepare(request)),
    createDraft: vi.fn(async (input: Readonly<{ payload: WordPressDraftPayload }>) => {
      payload = input.payload;
      return { externalId: "501", responseStatus: "draft" };
    }),
    readDraft: vi.fn(async () => ({
      externalId: "501",
      status: "draft",
      title: payload?.title ?? "",
      content: payload?.content ?? "",
      categoryIds: payload?.categories ?? [],
      tagIds: [],
      ...(payload?.featuredMediaId ? { featuredMediaId: payload.featuredMediaId } : {}),
    })),
    verifyDraft: vi.fn((draft, expected) => verifier.verifyDraft(draft, expected)),
  };
  const secrets = { readSecret: vi.fn(async () => SECRET) };
  const localMedia = { read: vi.fn(async () => PNG) };
  const service = new WordPressDraftApplicationService({
    secrets,
    categories,
    media,
    drafts,
    localMedia,
  });
  return {
    data,
    connection,
    categories,
    secrets,
    media,
    drafts,
    localMedia,
    service,
    createdPayload: () => {
      if (!payload) throw new Error("Draft payload was not created.");
      return payload;
    },
  };
}

function execution(data: UserData, connection: PlatformConnection) {
  return {
    data,
    projectId: "project-1",
    contentId: "content-1",
    connection,
    selectedTarget: true,
    finalConfirmation: true,
  } as const;
}

function baseData(document: ContentDocument, featuredImageAssetId?: string): UserData {
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
    quality: approvedQuality(document),
    publishingPreparation: {
      wordpress: {
        publishingAccountId: "wordpress-1",
        categoryIds: ["12"],
        categoryNames: ["Household"],
        ...(featuredImageAssetId ? { featuredImageAssetId } : {}),
        updatedAt: NOW,
      },
    },
  } as const;
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
    projects: [project],
    contents: [content],
    history: [],
    mediaMetadata: document.blocks.filter((block) => block.type === "image").map((block, index) => mediaAsset(block.id, block.assetId!, block.source, index + 1)),
    qualityReports: [],
    publishingRecords: [],
    scheduledPublishing: [],
  };
}

function baseConnection(mediaPermission = false): PlatformConnection {
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
    automationPermissions: mediaPermission ? [...safeDraftPermissions, "media.upload"] : safeDraftPermissions,
    publishingPolicy: "review_first",
  };
}

function categoryResult(
  connectionId: string,
  categories: WordPressCategoryListResult["categories"] = [{
    id: "12",
    externalCategoryId: "12",
    platform: "wordpress",
    name: "Household",
    selectable: true,
  }],
): WordPressCategoryListResult {
  return Object.freeze({
    platform: "wordpress",
    platformConnectionId: connectionId,
    categories: Object.freeze([...categories]),
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
      { id: "image-1", type: "image" as const, source: localSource(1), alt: "Canonical ALT", assetId: "asset-1" },
    ]),
  });
}

function twoImageDocument(): ContentDocument {
  return Object.freeze({
    ...textDocument(),
    blocks: Object.freeze([
      ...textDocument().blocks,
      { id: "image-1", type: "image" as const, source: localSource(1), alt: "Canonical ALT", assetId: "asset-1" },
      { id: "image-2", type: "image" as const, source: localSource(2), alt: "Second ALT", assetId: "asset-2" },
    ]),
  });
}

function localSource(index: number): string {
  return `/api/media/00000000-0000-0000-0000-${String(index).padStart(12, "0")}.png`;
}

function mediaAsset(blockId: string, assetId: string, source: string, index: number): MediaAsset {
  return Object.freeze({
    id: assetId,
    kind: "image",
    source,
    metadata: Object.freeze({
      createdAt: NOW,
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      blockId,
      fileName: `asset-${index}.png`,
      mimeType: "image/png",
      sizeBytes: PNG.byteLength,
      alt: index === 1 ? "Canonical ALT" : "Second ALT",
    }),
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
