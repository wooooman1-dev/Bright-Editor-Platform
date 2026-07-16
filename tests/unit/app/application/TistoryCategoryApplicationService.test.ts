import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TistoryCategoryApplicationService } from "../../../../app/application/publishing/TistoryCategoryApplicationService";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";
import { TistoryCategoryWorkflowError } from "../../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";

const connection: PlatformConnection = { id: "account", workspaceId: "workspace", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: { blogId: "blog", sessionStateAvailable: true }, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1, automationPermissions: safeDraftPermissions };
const input = { workspaceId: "workspace", projectId: "project", contentId: "content", connection, selectedTarget: true };

describe("Tistory category application boundary", () => {
  it("returns safe nested category metadata through the adapter", async () => {
    const readCategories = vi.fn(async () => ({ categories: [{ id: "1", name: "Parent", depth: 0 }, { id: "2", name: "Child", depth: 1, parentId: "1" }], supportsUncategorized: true as const, retrievedAt: "now" }));
    await expect(new TistoryCategoryApplicationService({ readCategories }).read(input)).resolves.toMatchObject({ categories: [{ id: "1", depth: 0 }, { id: "2", depth: 1, parentId: "1" }] });
    expect(readCategories).toHaveBeenCalledOnce();
  });

  it("supports an empty category list", async () => {
    const service = new TistoryCategoryApplicationService({ readCategories: async () => ({ categories: [], supportsUncategorized: true, retrievedAt: "now" }) });
    await expect(service.read(input)).resolves.toMatchObject({ categories: [], supportsUncategorized: true });
  });

  it("rejects expired sessions, permission denial, and cross-Workspace access before the adapter", async () => {
    const reader = { readCategories: vi.fn() };
    await expect(new TistoryCategoryApplicationService(reader).read({ ...input, connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: false } } })).rejects.toThrow("재연결 필요");
    await expect(new TistoryCategoryApplicationService(reader).read({ ...input, connection: { ...connection, automationPermissions: ["draft.create"] } })).rejects.toThrow("does not allow");
    await expect(new TistoryCategoryApplicationService(reader).read({ ...input, workspaceId: "other" })).rejects.toThrow("does not belong");
    expect(reader.readCategories).not.toHaveBeenCalled();
  });

  it("falls back to the last successful account-scoped category list after a transient connection failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-category-cache-"));
    const categories = [{ id: "1038988", name: "건강정보", depth: 0 }, { id: "1057542", name: "건강운동", depth: 0 }, { id: "1185792", name: "도움되는 정보", depth: 0 }];
    const reader = { readCategories: vi.fn().mockResolvedValueOnce({ categories, supportsUncategorized: true, retrievedAt: "2026-07-16T09:37:52.666Z" }).mockRejectedValueOnce(new TistoryCategoryWorkflowError("connection_error", "연결 실패", "다시 시도")) };
    const service = new TistoryCategoryApplicationService(reader, root);
    await expect(service.read(input)).resolves.toMatchObject({ categories, cached: false });
    await expect(service.read(input)).resolves.toMatchObject({ categories, cached: true, stale: true, failureCode: "connection_error" });
  });

  it("never reuses another Workspace or Publishing Account category cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-category-isolation-"));
    const success = { categories: [{ id: "1038988", name: "건강정보", depth: 0 }], supportsUncategorized: true as const, retrievedAt: "now" };
    await new TistoryCategoryApplicationService({ readCategories: async () => success }, root).read(input);
    const failure = { readCategories: async () => { throw new TistoryCategoryWorkflowError("connection_error", "연결 실패", "다시 시도"); } };
    await expect(new TistoryCategoryApplicationService(failure, root).read({ ...input, workspaceId: "other", connection: { ...connection, workspaceId: "other" } })).rejects.toThrow("연결 실패");
    await expect(new TistoryCategoryApplicationService(failure, root).read({ ...input, connection: { ...connection, id: "other-account" } })).rejects.toThrow("연결 실패");
  });

  it("does not hide an expired session behind cached categories", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-category-expired-"));
    const service = new TistoryCategoryApplicationService({ readCategories: vi.fn().mockResolvedValueOnce({ categories: [{ id: "1038988", name: "건강정보", depth: 0 }], supportsUncategorized: true, retrievedAt: "now" }).mockRejectedValueOnce(new TistoryCategoryWorkflowError("session_expired", "세션 만료", "재연결")) }, root);
    await service.read(input);
    await expect(service.read(input)).rejects.toMatchObject({ code: "session_expired" });
  });
});
