import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeDraftPermissions } from "../../../../core/connections";

const mocks = vi.hoisted(() => ({ save: vi.fn(), findById: vi.fn() }));

vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: { findById: mocks.findById, save: mocks.save },
}));
vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: { get: vi.fn(async () => ({ workspace: { id: "workspace-1" } })) },
}));

import { POST } from "../../../../app/api/connections/media-permission/route";

describe("WordPress media permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({
      id: "wordpress-1",
      workspaceId: "workspace-1",
      platform: "wordpress",
      displayName: "Example",
      status: "connected",
      publicMetadata: {},
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
      selectedAsDefault: false,
      version: 1,
      automationPermissions: safeDraftPermissions,
    });
  });

  it("requires an explicit Connection-scoped opt-in and preserves safe Draft permissions", async () => {
    const response = await POST(new Request("http://localhost/api/connections/media-permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace-1", connectionId: "wordpress-1", enabled: true }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: "wordpress-1",
      automationPermissions: expect.arrayContaining([...safeDraftPermissions, "media.upload"]),
    }));
  });
});
