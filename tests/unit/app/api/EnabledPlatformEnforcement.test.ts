import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  data: { workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["wordpress"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } }, brands: [], projects: [], contents: [] },
  connections: [{ id: "tistory-account", workspaceId: "workspace-1", platform: "tistory", displayName: "Preserved Blog", status: "connected", publicMetadata: {}, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1 }],
  save: vi.fn(),
}));

vi.mock("../../../../app/application/studio-store", () => ({ studioStore: { get: vi.fn(async () => runtime.data) } }));
vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: { listByWorkspace: vi.fn(async () => runtime.connections), findById: vi.fn(async (id: string) => runtime.connections.find((item) => item.id === id)), save: runtime.save },
  connectionJobRunner: { status: vi.fn(), start: vi.fn(), cancel: vi.fn() }, connectionRoot: ".bright-studio/connections", secretStore: {}, targetRepository: {}, connectionStore: {},
}));

import { GET, POST } from "../../../../app/api/connections/route";

describe("enabled platform connection enforcement", () => {
  beforeEach(() => runtime.save.mockClear());

  it("hides disabled platform accounts without deleting them", async () => {
    const response = await GET(new Request("http://localhost/api/connections?workspaceId=workspace-1"));
    await expect(response.json()).resolves.toMatchObject({ enabledPlatforms: ["wordpress"], connections: [] });
    expect(runtime.connections).toHaveLength(1);
    expect(runtime.save).not.toHaveBeenCalled();
  });

  it("blocks connection creation for a disabled platform", async () => {
    const response = await POST(new Request("http://localhost/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tistory-connect", workspaceId: "workspace-1", blogAddress: "sample.tistory.com" }) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("disabled") });
    expect(runtime.save).not.toHaveBeenCalled();
  });

  it("returns safe structured diagnostics for an invalid Tistory URL", async () => {
    runtime.data.workspace.settings.enabledPlatforms = ["tistory"];
    const response = await POST(new Request("http://localhost/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tistory-connect", workspaceId: "workspace-1", blogAddress: "https://not-tistory.example.com" }) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ failureCode: "invalid_blog_url", safeMessage: "Enter a valid Tistory blog address.", remediation: expect.any(String) });
    runtime.data.workspace.settings.enabledPlatforms = ["wordpress"];
  });
});
