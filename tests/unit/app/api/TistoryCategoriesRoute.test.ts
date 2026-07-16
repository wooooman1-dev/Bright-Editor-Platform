import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), read: vi.fn(), findById: vi.fn(), listByProject: vi.fn() }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: { get: mocks.get, set: mocks.set, update: vi.fn(async (_collection: string, _id: string, update: (current: typeof base) => typeof base) => update(await mocks.get())) } }));
vi.mock("../../../../app/application/connections/connection-runtime", () => ({ connectionRepository: { findById: mocks.findById }, targetRepository: { listByProject: mocks.listByProject } }));
vi.mock("../../../../app/application/publishing/TistoryCategoryApplicationService", () => ({ TistoryCategoryApplicationService: class { read = mocks.read; } }));

import { GET, POST } from "../../../../app/api/tistory/categories/route";
import { TistoryCategoryWorkflowError } from "../../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";

const base = {
  workspace: { id: "workspace", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
  brands: [], projects: [{ id: "project", workspaceId: "workspace", name: "Project", description: "", createdAt: "now", updatedAt: "now", selectedPublishingAccountIds: ["account"] }],
  contents: [{ id: "content", workspaceId: "workspace", projectId: "project", title: "Title", body: "", status: "draft", updatedAt: "now", selectedPublishingAccountIds: ["account"] }],
};
const connection = { id: "account", workspaceId: "workspace", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: { blogId: "blog", sessionStateAvailable: true }, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1 };

describe("Tistory category route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(base); mocks.findById.mockResolvedValue(connection); mocks.listByProject.mockResolvedValue([{ projectId: "project", platformConnectionId: "account", platform: "tistory", selectedAt: "now" }]); mocks.read.mockResolvedValue({ categories: [{ id: "1038988", name: "건강정보", depth: 0 }, { id: "1057542", name: "건강운동", depth: 0 }, { id: "1185792", name: "도움되는 정보", depth: 0 }], supportsUncategorized: true, retrievedAt: "now" }); });

  it("persists a server-validated category ID and name without session data", async () => {
    const response = await POST(request({ workspaceId: "workspace", contentId: "content", connectionId: "account", categoryId: "1057542" }));
    expect(response.status).toBe(200);
    const safeBody = await response.clone().text();
    const persistedBody = response.clone();
    await expect(response.json()).resolves.toMatchObject({ preparation: { publishingAccountId: "account", platformCategoryId: "1057542", platformCategoryName: "건강운동" } });
    await expect(persistedBody.json()).resolves.toMatchObject({ data: { contents: [expect.objectContaining({ publishingPreparation: { tistory: expect.objectContaining({ platformCategoryId: "1057542" }) } })] } });
    expect(safeBody).not.toContain("storageState");
  });

  it("supports an explicit uncategorized selection", async () => {
    const response = await POST(request({ workspaceId: "workspace", contentId: "content", connectionId: "account", categoryId: null }));
    await expect(response.json()).resolves.toMatchObject({ preparation: { platformCategoryId: null, platformCategoryName: null } });
  });

  it("returns string category options and reapplies the persisted selected value", async () => {
    const response = await GET(new Request("http://localhost/api/tistory/categories?workspaceId=workspace&contentId=content&connectionId=account"));
    await expect(response.json()).resolves.toMatchObject({ categories: [{ id: "1038988", name: "건강정보" }, { id: "1057542", name: "건강운동" }, { id: "1185792", name: "도움되는 정보" }] });
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace", projectId: "project", contentId: "content", selectedTarget: true }));
  });

  it("returns a last-successful list with a safe stale warning", async () => {
    mocks.read.mockResolvedValueOnce({ categories: [{ id: "1038988", name: "건강정보", depth: 0 }], supportsUncategorized: true, retrievedAt: "earlier", cached: true, stale: true, failureCode: "connection_error" });
    const response = await GET(new Request("http://localhost/api/tistory/categories?workspaceId=workspace&contentId=content&connectionId=account"));
    await expect(response.json()).resolves.toMatchObject({ cached: true, stale: true, failureCode: "connection_error", safeMessage: expect.stringContaining("마지막으로 확인된") });
  });

  it("classifies a worker connection failure without exposing the raw worker error", async () => {
    mocks.read.mockRejectedValueOnce(new TistoryCategoryWorkflowError("connection_error", "Tistory 카테고리를 불러오지 못했습니다.", "다시 시도해 주세요.", { raw: "page.goto net::ERR_INTERNET_DISCONNECTED C:\\secret" }));
    const response = await GET(new Request("http://localhost/api/tistory/categories?workspaceId=workspace&contentId=content&connectionId=account"));
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain('"state":"connection_error"');
    expect(body).not.toContain("ERR_INTERNET_DISCONNECTED");
    expect(body).not.toContain("C:\\\\secret");
  });

  it("rejects disabled and cross-Workspace category access", async () => {
    mocks.get.mockResolvedValueOnce({ ...base, workspace: { ...base.workspace, settings: { ...base.workspace.settings, enabledPlatforms: ["wordpress"] } } });
    expect((await POST(request({ workspaceId: "workspace", contentId: "content", connectionId: "account", categoryId: "1057542" }))).status).toBe(400);
    expect((await POST(request({ workspaceId: "other", contentId: "content", connectionId: "account", categoryId: "1057542" }))).status).toBe(400);
  });
});

function request(body: unknown) { return new Request("http://localhost/api/tistory/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
