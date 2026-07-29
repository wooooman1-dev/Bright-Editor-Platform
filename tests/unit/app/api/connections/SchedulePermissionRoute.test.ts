import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn() }));
const connectionMocks = vi.hoisted(() => ({ findById: vi.fn(), save: vi.fn() }));
vi.mock("../../../../../app/application/studio-store", () => ({ studioStore: storeMocks }));
vi.mock("../../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: connectionMocks,
}));

import { POST } from "../../../../../app/api/connections/schedule-permission/route";
import { safeDraftPermissions } from "../../../../../core/connections";

function request(enabled: boolean) {
  return requestBody({ workspaceId: "workspace-1", connectionId: "connection-1", enabled });
}

function requestBody(body: Record<string, unknown>) {
  return new Request("http://localhost/api/connections/schedule-permission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function connection(permissions = safeDraftPermissions) {
  return {
    id: "connection-1",
    workspaceId: "workspace-1",
    platform: "tistory",
    displayName: "bright-health",
    status: "connected",
    publicMetadata: { sessionStateAvailable: true },
    automationPermissions: permissions,
    publishingPolicy: "review_first",
    createdAt: "2026-07-28T07:00:00.000Z",
    updatedAt: "2026-07-28T07:00:00.000Z",
    lastVerifiedAt: "2026-07-28T07:00:00.000Z",
    selectedAsDefault: true,
    version: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.get.mockResolvedValue({ workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [], contents: [] });
  connectionMocks.findById.mockResolvedValue(connection());
  connectionMocks.save.mockResolvedValue(undefined);
});

describe("Tistory schedule permission API", () => {
  it("adds schedule.create without enabling public publishing", async () => {
    const response = await POST(request(true));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.publicPublishEnabled).toBe(false);
    expect(connectionMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      automationPermissions: expect.arrayContaining(["schedule.create"]),
      version: 2,
    }));
    const saved = connectionMocks.save.mock.calls[0][0] as { automationPermissions: readonly string[] };
    expect(saved.automationPermissions).not.toContain("publish.execute");
  });

  it("removes only schedule.create when disabled", async () => {
    connectionMocks.findById.mockResolvedValue(connection([...safeDraftPermissions, "schedule.create", "media.upload"]));

    const response = await POST(request(false));

    expect(response.status).toBe(200);
    const saved = connectionMocks.save.mock.calls[0][0] as { automationPermissions: readonly string[] };
    expect(saved.automationPermissions).not.toContain("schedule.create");
    expect(saved.automationPermissions).toContain("media.upload");
  });

  it("rejects a missing enabled state instead of treating it as a disable command", async () => {
    const response = await POST(requestBody({ workspaceId: "workspace-1", connectionId: "connection-1" }));

    expect(response.status).toBe(400);
    expect(connectionMocks.save).not.toHaveBeenCalled();
  });

  it("rejects a connection owned by another workspace", async () => {
    connectionMocks.findById.mockResolvedValue({ ...connection(), workspaceId: "workspace-other" });

    const response = await POST(request(true));

    expect(response.status).toBe(400);
    expect(connectionMocks.save).not.toHaveBeenCalled();
  });
});
