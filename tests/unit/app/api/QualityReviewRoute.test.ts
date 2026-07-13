import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: mocks }));

import { POST } from "../../../../app/api/studio/route";

describe("server-calculated Quality Review API", () => {
  it("ignores client-supplied scores and persists the reviewed document revision", async () => {
    mocks.get.mockResolvedValue({
      workspace: { id: "workspace", name: "Studio" }, brands: [], projects: [{ id: "project", workspaceId: "workspace", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
      contents: [{ id: "content", workspaceId: "workspace", projectId: "project", title: "기획안", body: "", status: "draft", updatedAt: "now", contentType: "long-form blog article", primaryKeyword: "건강", searchIntent: "건강 정보", document: { id: "content", title: "기획안", blocks: [{ id: "p", type: "paragraph", text: "이 글에서는 건강 정보를 작성할 예정입니다." }] } }],
      qualityReports: [], publishingRecords: [], scheduledPublishing: [], history: [], mediaMetadata: [],
    });
    const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review-quality", input: { workspaceId: "workspace", contentId: "content", overallScore: 100, approved: true } }) }));
    const result = await response.json() as { quality: { overallScore: number; approved: boolean; reviewedRevisionId: string } };
    expect(result.quality.overallScore).toBeLessThan(100);
    expect(result.quality.approved).toBe(false);
    expect(result.quality.reviewedRevisionId).toMatch(/^rev-/);
    expect(mocks.set).toHaveBeenCalledWith("application", "user-data", expect.objectContaining({ qualityReports: [expect.objectContaining({ contentId: "content" })] }));
  });
});
