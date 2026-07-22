import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TistoryPostCatalogApplicationService } from "../../../../app/application/publishing/TistoryPostCatalogApplicationService";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const connection: PlatformConnection = { id: "account", workspaceId: "workspace", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: { blogId: "blog", sessionStateAvailable: true }, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1, automationPermissions: safeDraftPermissions };
const input = { workspaceId: "workspace", projectId: "project", contentId: "content", connection, selectedTarget: true } as const;

describe("TistoryPostCatalogApplicationService", () => {
  it("keeps cache separated by Workspace/account and refresh bypasses it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bright-posts-")); roots.push(root);
    const readPosts = vi.fn().mockResolvedValue({ posts: [{ platform: "tistory", externalPostId: "1", title: "공개 글", publishedUrl: "https://blog.tistory.com/entry/one", categoryId: "1038988", categoryName: "건강정보", keywords: [], status: "public", retrievedAt: "2026-07-14T00:00:00.000Z" }], state: "success", retrievedAt: "2026-07-14T00:00:00.000Z", pagesRead: 1 });
    const service = new TistoryPostCatalogApplicationService({ readPosts }, root, () => new Date("2026-07-14T01:00:00.000Z"));
    expect((await service.read(input)).cached).toBe(false);
    expect((await service.read(input)).cached).toBe(true);
    expect((await service.read({ ...input, refresh: true })).cached).toBe(false);
    expect(readPosts).toHaveBeenCalledTimes(2);
  });
  it("refreshes a legacy cache when every cached post is missing category metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bright-posts-category-")); roots.push(root);
    const readPosts = vi.fn()
      .mockResolvedValueOnce({ posts: [{ platform: "tistory", externalPostId: "1", title: "공개 글", publishedUrl: "https://blog.tistory.com/entry/one", keywords: [], status: "public", retrievedAt: "2026-07-14T00:00:00.000Z" }], state: "success", retrievedAt: "2026-07-14T00:00:00.000Z", pagesRead: 1 })
      .mockResolvedValueOnce({ posts: [{ platform: "tistory", externalPostId: "1", title: "공개 글", publishedUrl: "https://blog.tistory.com/entry/one", categoryId: "1038988", categoryName: "건강정보", keywords: ["건강정보"], status: "public", retrievedAt: "2026-07-14T01:00:00.000Z" }], state: "success", retrievedAt: "2026-07-14T01:00:00.000Z", pagesRead: 1 });
    const service = new TistoryPostCatalogApplicationService({ readPosts }, root, () => new Date("2026-07-14T02:00:00.000Z"));

    expect((await service.read(input)).cached).toBe(false);
    const refreshed = await service.read(input);

    expect(refreshed.cached).toBe(false);
    expect(refreshed.posts[0]?.categoryId).toBe("1038988");
    expect(refreshed.posts[0]?.categoryName).toBe("건강정보");
    expect(readPosts).toHaveBeenCalledTimes(2);
  });

  it("enforces selected target and post.read permission", async () => {
    const service = new TistoryPostCatalogApplicationService({ readPosts: vi.fn() });
    await expect(service.read({ ...input, selectedTarget: false })).rejects.toThrow("발행 대상");
    await expect(service.read({ ...input, connection: { ...connection, automationPermissions: ["draft.create"] } })).rejects.toThrow("does not allow");
  });
});
