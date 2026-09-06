import { describe, expect, it, vi } from "vitest";

import { InternalLinkCatalogEvaluationService } from "../../../../../app/application/publishing/InternalLinkCatalogEvaluationService";
import { publishingInternalLinkContextKey } from "../../../../../app/application/publishing/InternalLinkCatalogPolicy";
import type { PlatformConnection } from "../../../../../core/connections";
import type { ContentDocument } from "../../../../../core/content";
import type { UserContent } from "../../../../../app/user-flow/user-data";

const document: ContentDocument = {
  id: "document-1",
  title: "통장 쪼개기 방법",
  blocks: [{ id: "p1", type: "paragraph", text: "계좌 역할을 구분하는 방법을 설명합니다." }],
};

const content: UserContent = {
  id: "content-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  title: document.title,
  body: "",
  status: "ready",
  updatedAt: "2026-07-31T00:00:00.000Z",
  primaryKeyword: "통장 쪼개기 방법",
  document,
  publishingPreparation: {
    wordpress: {
      publishingAccountId: "wordpress-1",
      categoryIds: ["2"],
      categoryNames: ["생활경제"],
      updatedAt: "2026-07-31T00:00:00.000Z",
    },
  },
};

const connection: PlatformConnection = {
  id: "wordpress-1",
  workspaceId: "workspace-1",
  platform: "wordpress",
  displayName: "생활경제",
  status: "connected",
  publicMetadata: {},
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
  selectedAsDefault: false,
  version: 1,
};

function catalogResult(posts: readonly Readonly<{
  externalPostId: string;
  title: string;
  publishedUrl: string;
  categoryId?: string;
  categoryName?: string;
}>[] = []) {
  return {
    platform: "wordpress",
    platformConnectionId: connection.id,
    state: posts.length ? "success" : "empty",
    posts,
    retrievedAt: "2026-07-31T00:00:00.000Z",
    cached: false,
  };
}

describe("InternalLinkCatalogEvaluationService", () => {
  it("marks an empty public catalog as evaluated instead of leaving internal links unexamined", async () => {
    const read = vi.fn().mockResolvedValue(catalogResult());
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content,
      document,
      connection,
      selectedTarget: true,
      ownExternalPostIds: [],
      refresh: true,
    });

    expect(read).toHaveBeenCalledOnce();
    expect(result.metadata?.internalLinkCatalogStatus).toBe("evaluated");
    expect(result.metadata?.availableRelatedContentCandidates).toBe(0);
    expect(result.metadata?.internalLinkCatalogContextKey).toBe(
      publishingInternalLinkContextKey(content, connection.id),
    );
  });

  it("reports a missing publishing Category without reading the catalog", async () => {
    const read = vi.fn();
    const missingCategory = { ...content, publishingPreparation: undefined };
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content: missingCategory,
      document,
      connection,
      selectedTarget: true,
      ownExternalPostIds: [],
    });

    expect(read).not.toHaveBeenCalled();
    expect(result.metadata?.internalLinkCatalogStatus).toBe("category_missing");
    expect(result.metadata?.internalLinkCatalogContextKey).toBe(
      publishingInternalLinkContextKey(missingCategory, connection.id),
    );
  });

  it("reuses a current evaluated snapshot without another external read", async () => {
    const read = vi.fn();
    const evaluated: ContentDocument = {
      ...document,
      metadata: {
        buttonCount: 0,
        createdAt: "2026-07-31T00:00:00.000Z",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "2026-07-31T00:00:00.000Z",
        version: 1,
        videoCount: 0,
        wordCount: 10,
        internalLinkCatalogStatus: "evaluated",
        availableRelatedContentCandidates: 0,
        internalLinkCatalogContextKey: publishingInternalLinkContextKey(content, connection.id),
      },
    };
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content,
      document: evaluated,
      connection,
      selectedTarget: true,
      ownExternalPostIds: [],
    });

    expect(read).not.toHaveBeenCalled();
    expect(result).toBe(evaluated);
  });

  it("forces a fresh catalog read when explicitly requested", async () => {
    const read = vi.fn().mockResolvedValue(catalogResult());
    const evaluated: ContentDocument = {
      ...document,
      metadata: {
        buttonCount: 0,
        createdAt: "2026-07-31T00:00:00.000Z",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "2026-07-31T00:00:00.000Z",
        version: 1,
        videoCount: 0,
        wordCount: 10,
        internalLinkCatalogStatus: "evaluated",
        availableRelatedContentCandidates: 0,
        internalLinkCatalogContextKey: publishingInternalLinkContextKey(content, connection.id),
      },
    };

    await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content,
      document: evaluated,
      connection,
      selectedTarget: true,
      ownExternalPostIds: [],
      refresh: true,
    });

    expect(read).toHaveBeenCalledOnce();
  });

  it("re-evaluates and removes stale automatic links after the Category changes", async () => {
    const changedContent: UserContent = {
      ...content,
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["3"],
          categoryNames: ["정부지원"],
          updatedAt: "2026-07-31T01:00:00.000Z",
        },
      },
    };
    const staleDocument: ContentDocument = {
      ...document,
      blocks: [
        ...document.blocks,
        { id: "auto-related-post", type: "button", purpose: "related_post", label: "과거 글", targetUrl: "https://example.com/old", target: "_self" },
      ],
      metadata: {
        buttonCount: 1,
        createdAt: "2026-07-31T00:00:00.000Z",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "2026-07-31T00:00:00.000Z",
        version: 1,
        videoCount: 0,
        wordCount: 10,
        internalLinkCatalogStatus: "evaluated",
        availableRelatedContentCandidates: 1,
        internalLinkCatalogContextKey: publishingInternalLinkContextKey(content, connection.id),
      },
    };
    const read = vi.fn().mockResolvedValue(catalogResult());
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content: changedContent,
      document: staleDocument,
      connection,
      selectedTarget: true,
      ownExternalPostIds: [],
    });

    expect(read).toHaveBeenCalledOnce();
    expect(result.blocks.some((block) => block.id === "auto-related-post")).toBe(false);
    expect(result.metadata?.internalLinkCatalogContextKey).toBe(
      publishingInternalLinkContextKey(changedContent, connection.id),
    );
  });
});
