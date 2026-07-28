import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserData } from "../../../../app/user-flow/user-data";
import type { PlatformConnection } from "../../../../core/connections";

const runtime = vi.hoisted(() => {
  const initialData: UserData = { workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [], contents: [] };
  const initialConnection: PlatformConnection = {
    id: "account-1",
    workspaceId: "workspace-1",
    platform: "wordpress",
    displayName: "Site",
    status: "connected",
    publicMetadata: {
      siteUrl: "https://example.com",
      username: "owner",
      applicationPassword: "must-not-leak",
      cookie: "must-not-leak",
    },
    secretReference: "secret-file",
    createdAt: "now",
    updatedAt: "now",
    selectedAsDefault: false,
    version: 1,
  };
  return {
    data: initialData,
    connections: [initialConnection] as PlatformConnection[],
    initialConnection,
  };
});

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: {
    get: vi.fn(async () => runtime.data),
    set: vi.fn(async (_collection: string, _id: string, value: UserData) => { runtime.data = value; }),
  },
}));
vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: { listByWorkspace: vi.fn(async (workspaceId: string) => runtime.connections.filter((item) => item.workspaceId === workspaceId)) },
  connectionJobRunner: { statusByConnection: vi.fn(() => undefined) },
  connectionRoot: "test-connection-root",
}));

import { GET, POST } from "../../../../app/api/settings/route";

describe("Settings API", () => {
  beforeEach(() => {
    runtime.data = { workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [], contents: [] };
    runtime.connections = [runtime.initialConnection];
  });

  it("rejects another Workspace and never returns credentials or session material", async () => {
    const denied = await GET(new Request("http://localhost/api/settings?workspaceId=other"));
    expect(denied.status).toBe(400);
    const response = await GET(new Request("http://localhost/api/settings?workspaceId=workspace-1"));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("must-not-leak");
    expect(text).not.toContain("secret-file");
    expect(text).not.toContain("cookie");
  });

  it("persists Workspace-scoped publishing policy and name across reloads", async () => {
    const publishing = await POST(request({ action: "save-publishing", workspaceId: "workspace-1", sequentialDraftSave: false }));
    expect(publishing.status).toBe(200);
    const rename = await POST(request({ action: "rename-workspace", workspaceId: "workspace-1", name: "Renamed" }));
    expect(rename.status).toBe(200);
    const reloaded = await GET(new Request("http://localhost/api/settings?workspaceId=workspace-1"));
    await expect(reloaded.json()).resolves.toMatchObject({ workspace: { name: "Renamed" }, settings: { publishing: { draftOnly: true, publicPublish: false, sequentialDraftSave: false } } });
  });

  it("persists enabled platforms, hides disabled accounts, and restores preserved accounts", async () => {
    const disabled = await POST(request({ action: "save-enabled-platforms", workspaceId: "workspace-1", enabledPlatforms: ["tistory"] }));
    expect(disabled.status).toBe(200);
    const hidden = await GET(new Request("http://localhost/api/settings?workspaceId=workspace-1"));
    const hiddenBody = await hidden.json() as { settings: { enabledPlatforms: string[] }; platforms: Record<string, unknown>; connections: unknown[] };
    expect(hiddenBody.settings.enabledPlatforms).toEqual(["tistory"]);
    expect(Object.keys(hiddenBody.platforms)).toEqual(["tistory"]);
    expect(hiddenBody.connections).toEqual([]);
    expect(runtime.connections).toHaveLength(1);

    const restored = await POST(request({ action: "save-enabled-platforms", workspaceId: "workspace-1", enabledPlatforms: ["tistory", "wordpress"] }));
    const restoredBody = await restored.json() as { connections: Array<{ id: string }> };
    expect(restoredBody.connections).toEqual([expect.objectContaining({ id: "account-1" })]);
  });

  it("does not expose a Tistory connection as active when its stored session file is missing", async () => {
    runtime.data = {
      workspace: {
        id: "workspace-1",
        name: "Studio",
        settings: {
          enabledPlatforms: ["tistory"],
          publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true },
          appearance: { theme: "system" },
        },
      },
      brands: [],
      projects: [],
      contents: [],
    };
    runtime.connections = [{
      id: "tistory-1",
      workspaceId: "workspace-1",
      platform: "tistory",
      displayName: "viva-rain",
      status: "connected",
      publicMetadata: {
        blogId: "viva-rain",
        blogUrl: "https://viva-rain.tistory.com",
        sessionStateAvailable: true,
      },
      createdAt: "now",
      updatedAt: "now",
      lastVerifiedAt: "now",
      selectedAsDefault: false,
      version: 1,
    }];

    const response = await GET(new Request("http://localhost/api/settings?workspaceId=workspace-1"));
    const body = await response.json() as { connections: Array<{ status: string; publicMetadata: { sessionStateAvailable: boolean } }> };

    expect(response.status).toBe(200);
    expect(body.connections[0]).toMatchObject({
      status: "disconnected",
      publicMetadata: { sessionStateAvailable: false },
    });
  });

  it("rejects a cross-Workspace enabled-platform update", async () => {
    const response = await POST(request({ action: "save-enabled-platforms", workspaceId: "other", enabledPlatforms: ["youtube"] }));
    expect(response.status).toBe(400);
    const onboarding = await POST(request({ action: "complete-platform-onboarding", workspaceId: "other", enabledPlatforms: ["tistory"] }));
    expect(onboarding.status).toBe(400);
    expect(runtime.data.workspace?.settings).toBeUndefined();
  });

  it("requires at least one platform for onboarding and persists completion", async () => {
    const empty = await POST(request({ action: "complete-platform-onboarding", workspaceId: "workspace-1", enabledPlatforms: [] }));
    expect(empty.status).toBe(400);
    expect(runtime.data.workspace?.settings).toBeUndefined();

    const completed = await POST(request({ action: "complete-platform-onboarding", workspaceId: "workspace-1", enabledPlatforms: ["youtube"] }));
    expect(completed.status).toBe(200);
    const reloaded = await GET(new Request("http://localhost/api/settings?workspaceId=workspace-1"));
    await expect(reloaded.json()).resolves.toMatchObject({ settings: { enabledPlatforms: ["youtube"] }, platforms: { youtube: { status: "not_supported" } } });
  });
});

function request(body: unknown) { return new Request("http://localhost/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
