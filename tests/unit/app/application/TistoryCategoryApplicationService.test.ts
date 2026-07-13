import { describe, expect, it, vi } from "vitest";

import { TistoryCategoryApplicationService } from "../../../../app/application/publishing/TistoryCategoryApplicationService";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

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
});
