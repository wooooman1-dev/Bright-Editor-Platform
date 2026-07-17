import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: { get: vi.fn(), set: vi.fn() },
}));

import { studioStore } from "../../../../app/application/studio-store";
import { POST } from "../../../../app/api/studio/route";

const workspace = {
  id: "workspace-1",
  name: "Studio",
  settings: {
    enabledPlatforms: ["tistory"],
    publishing: {
      reviewFirst: true,
      draftOnly: true,
      publicPublish: false,
      sequentialDraftSave: true,
      qualityApprovalRequired: true,
    },
    appearance: { theme: "system" },
  },
};

const document = {
  id: "content-1",
  title: "장 건강 가이드",
  blocks: [
    { id: "h", type: "heading", level: 2, text: "장 건강" },
    { id: "p", type: "paragraph", text: "짧은 본문입니다." },
  ],
};

describe("quality improvement candidate route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a scored rejected candidate instead of dropping the generated result", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    vi.mocked(studioStore.get).mockResolvedValueOnce({
      workspace,
      brands: [],
      projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
      contents: [{
        id: "content-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        title: document.title,
        body: "",
        status: "in_review",
        contentType: "article",
        platform: "tistory",
        primaryKeyword: "장내 마이크로바이옴",
        searchIntent: "장 건강 정보",
        document,
        createdAt: "now",
        updatedAt: "now",
      }],
      qualityReports: [],
    } as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({ title: document.title, blocks: document.blocks }),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "improve-quality", input: { workspaceId: "workspace-1", contentId: "content-1" } }),
    }));
    const result = await response.json() as {
      document?: unknown;
      baselineQuality?: unknown;
      quality?: unknown;
      improvement?: { accepted: boolean; reasons: string[] };
    };

    expect(response.status).toBe(200);
    expect(result.document).toBeDefined();
    expect(result.baselineQuality).toBeDefined();
    expect(result.quality).toBeDefined();
    expect(result.improvement?.accepted).toBe(false);
    expect(result.improvement?.reasons.length).toBeGreaterThan(0);
  });
});
