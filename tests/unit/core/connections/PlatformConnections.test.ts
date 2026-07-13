import { describe, expect, it, vi } from "vitest";
import { PlatformConnectionService, type PlatformConnection } from "../../../../core/connections";

const connection: PlatformConnection = { id: "connection-1", workspaceId: "workspace-1", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: { blogId: "blog" }, secretReference: "opaque", createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1 };
describe("PlatformConnection ownership", () => {
  it("selects only a connected same-Workspace reference", async () => {
    const targets = { save: vi.fn(), findByProject: vi.fn(), delete: vi.fn() };
    const service = new PlatformConnectionService({ findById: vi.fn().mockResolvedValue(connection), save: vi.fn(), delete: vi.fn(), listByWorkspace: vi.fn() }, targets);
    const target = await service.selectTarget({ id: "project-1", name: "Project", workspaceId: "workspace-1" }, "connection-1", new Date("2026-01-01"));
    expect(target.platformConnectionId).toBe("connection-1"); expect(targets.save).toHaveBeenCalledOnce();
  });
  it("rejects cross-Workspace selection", async () => {
    const service = new PlatformConnectionService({ findById: vi.fn().mockResolvedValue(connection), save: vi.fn(), delete: vi.fn(), listByWorkspace: vi.fn() }, { save: vi.fn(), findByProject: vi.fn(), delete: vi.fn() });
    await expect(service.selectTarget({ id: "project-2", name: "Other", workspaceId: "workspace-2" }, "connection-1")).rejects.toThrow("Project Workspace");
  });
  it("keeps credentials out of public metadata", () => { expect(JSON.stringify(connection.publicMetadata)).not.toContain("opaque"); expect(connection.secretReference).toBe("opaque"); });
});
