import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), read: vi.fn(), findById: vi.fn(), listByProject: vi.fn() }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: { get: mocks.get, set: mocks.set } }));
vi.mock("../../../../app/application/connections/connection-runtime", () => ({ connectionRepository: { findById: mocks.findById }, targetRepository: { listByProject: mocks.listByProject } }));
vi.mock("../../../../app/application/publishing/TistoryCategoryApplicationService", () => ({ TistoryCategoryApplicationService: class { read = mocks.read; } }));

import { POST } from "../../../../app/api/tistory/categories/route";

const base = {
  workspace: { id: "workspace", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
  brands: [], projects: [{ id: "project", workspaceId: "workspace", name: "Project", description: "", createdAt: "now", updatedAt: "now", selectedPublishingAccountIds: ["account"] }],
  contents: [{ id: "content", workspaceId: "workspace", projectId: "project", title: "Title", body: "", status: "draft", updatedAt: "now", selectedPublishingAccountIds: ["account"] }],
};
const connection = { id: "account", workspaceId: "workspace", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: { blogId: "blog", sessionStateAvailable: true }, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1 };

describe("Tistory category route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(base); mocks.findById.mockResolvedValue(connection); mocks.listByProject.mockResolvedValue([{ projectId: "project", platformConnectionId: "account", platform: "tistory", selectedAt: "now" }]); mocks.read.mockResolvedValue({ categories: [{ id: "parent", name: "상위", depth: 0 }, { id: "child", name: "하위", depth: 1, parentId: "parent" }], supportsUncategorized: true, retrievedAt: "now" }); });

  it("persists a server-validated category ID and name without session data", async () => {
    const response = await POST(request({ workspaceId: "workspace", contentId: "content", connectionId: "account", categoryId: "child" }));
    expect(response.status).toBe(200);
    const safeBody = await response.clone().text();
    await expect(response.json()).resolves.toMatchObject({ preparation: { publishingAccountId: "account", platformCategoryId: "child", platformCategoryName: "하위" } });
    expect(mocks.set).toHaveBeenCalledWith("application", "user-data", expect.objectContaining({ contents: [expect.objectContaining({ publishingPreparation: { tistory: expect.objectContaining({ platformCategoryId: "child" }) } })] }));
    expect(safeBody).not.toContain("storageState");
  });

  it("supports an explicit uncategorized selection", async () => {
    const response = await POST(request({ workspaceId: "workspace", contentId: "content", connectionId: "account", categoryId: null }));
    await expect(response.json()).resolves.toMatchObject({ preparation: { platformCategoryId: null, platformCategoryName: "카테고리 없음" } });
  });

  it("rejects disabled and cross-Workspace category access", async () => {
    mocks.get.mockResolvedValueOnce({ ...base, workspace: { ...base.workspace, settings: { ...base.workspace.settings, enabledPlatforms: ["wordpress"] } } });
    expect((await POST(request({ workspaceId: "workspace", contentId: "content", connectionId: "account", categoryId: "child" }))).status).toBe(400);
    expect((await POST(request({ workspaceId: "other", contentId: "content", connectionId: "account", categoryId: "child" }))).status).toBe(400);
  });
});

function request(body: unknown) { return new Request("http://localhost/api/tistory/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
