import { describe, expect, it, vi } from "vitest";

import { InternalLinkCatalogEvaluationService } from "../../../../../app/application/publishing/InternalLinkCatalogEvaluationService";
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

describe("InternalLinkCatalogEvaluationService", () => {
  it("marks an empty public catalog as evaluated instead of leaving internal links unexamined", async () => {
    const read = vi.fn().mockResolvedValue({
      platform: "wordpress",
      platformConnectionId: connection.id,
      state: "empty",
      posts: [],
      retrievedAt: "2026-07-31T00:00:00.000Z",
      cached: false,
    });
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content,
      document,
      connection,
      selectedTarget: true,
      refresh: true,
    });

    expect(read).toHaveBeenCalledOnce();
    expect(result.metadata?.internalLinkCatalogStatus).toBe("evaluated");
    expect(result.metadata?.availableRelatedContentCandidates).toBe(0);
  });

  it("reports a missing publishing Category without reading the catalog", async () => {
    const read = vi.fn();
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content: { ...content, publishingPreparation: undefined },
      document,
      connection,
      selectedTarget: true,
    });

    expect(read).not.toHaveBeenCalled();
    expect(result.metadata?.internalLinkCatalogStatus).toBe("category_missing");
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
      },
    };
    const result = await new InternalLinkCatalogEvaluationService({ read }).evaluate({
      workspaceId: "workspace-1",
      projectId: "project-1",
      content,
      document: evaluated,
      connection,
      selectedTarget: true,
    });

    expect(read).not.toHaveBeenCalled();
    expect(result).toBe(evaluated);
  });
});
