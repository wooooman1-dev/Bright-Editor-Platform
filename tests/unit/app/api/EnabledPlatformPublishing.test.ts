import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/application/studio-store", () => ({
  studioDataPath: "studio-data.json",
  studioStore: { get: vi.fn(async () => ({ workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["wordpress"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } }, brands: [], projects: [], contents: [] })) },
}));

import { POST } from "../../../../app/api/tistory/route";

describe("enabled platform publishing enforcement", () => {
  it("blocks Tistory publishing preparation when Tistory is disabled", async () => {
    const response = await POST(new Request("http://localhost/api/tistory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", connectionId: "account-1", finalConfirmation: true }) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("티스토리가 비활성화") });
  });
});
