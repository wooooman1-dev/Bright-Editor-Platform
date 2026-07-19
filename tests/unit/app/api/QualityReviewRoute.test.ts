import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: mocks }));

import { POST } from "../../../../app/api/studio/route";
import type { UserData } from "../../../../app/user-flow/user-data";

describe("server-calculated Quality Review API", () => {
  it("ignores client-supplied scores and persists the reviewed document revision", async () => {
    const current: UserData = {
      workspace: { id: "workspace", name: "Studio" }, brands: [], projects: [{ id: "project", workspaceId: "workspace", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
      contents: [{ id: "content", workspaceId: "workspace", projectId: "project", title: "기획안", body: "", status: "draft", updatedAt: "now", contentType: "long-form blog article", primaryKeyword: "건강", searchIntent: "건강 정보", document: { id: "content", title: "기획안", blocks: [{ id: "p", type: "paragraph", text: "이 글에서는 건강 정보를 작성할 예정입니다." }] } }],
      qualityReports: [], publishingRecords: [], scheduledPublishing: [], history: [], mediaMetadata: [],
    };
    mocks.get.mockResolvedValue(current);
    mocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => updater(current));
    const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review-quality", input: { workspaceId: "workspace", contentId: "content", overallScore: 100, approved: true } }) }));
    const result = await response.json() as { document: { title: string }; quality: { overallScore: number; approved: boolean; reviewedRevisionId: string; tasks: Array<{ category: string; message: string }> }; data: UserData };
    expect(result.quality.overallScore).toBeLessThan(100);
    expect(result.quality.approved).toBe(false);
    expect(result.quality.reviewedRevisionId).toMatch(/^rev-/);
    expect(result.document.title).toBe("기획안");
    expect(result.quality.tasks.some((task) => task.category === "seo" && task.message.includes("핵심 키워드"))).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ qualityReports: [expect.objectContaining({ contentId: "content" })] }));
    expect(mocks.update).toHaveBeenCalledWith("application", "user-data", expect.any(Function));
  });
});
