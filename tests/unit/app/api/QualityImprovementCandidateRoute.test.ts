import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: { get: vi.fn(), set: vi.fn() },
}));

import { studioStore } from "../../../../app/application/studio-store";
import { POST } from "../../../../app/api/studio/route";
import type { ContentDocument } from "../../../../core/content";
import type { QualityReport } from "../../../../core/quality";

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

const primaryKeyword = "장내 마이크로바이옴 정신 건강";
const prose = "이 글은 장 건강을 관리하는 데 필요한 생활 습관과 식사 원칙을 구체적인 예시와 함께 설명합니다. 독자가 바로 실천할 수 있도록 단계별 방법과 주의사항을 안내합니다. ".repeat(18);
const document = {
  id: "content-1",
  title: "장 건강 가이드",
  blocks: [
    { id: "intro", type: "paragraph", text: prose },
    { id: "image", type: "image", source: "", alt: "장 건강 생활 습관을 설명하는 이미지" },
    ...Array.from({ length: 5 }, (_, index) => [
      { id: `h-${index}`, type: "heading", level: 2, text: `장 건강 관리 ${index + 1}` },
      { id: `p-${index}`, type: "paragraph", text: prose },
    ]).flat(),
    { id: "conclusion", type: "paragraph", text: prose },
  ],
};

describe("quality improvement candidate route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("places the confirmed keyword and raises SEO even when AI returns the unchanged title", async () => {
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
        primaryKeyword,
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
      document?: ContentDocument;
      baselineQuality?: QualityReport;
      quality?: QualityReport;
      improvement?: { accepted: boolean; reasons: string[] };
      error?: string;
    };

    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.document?.title).toContain(primaryKeyword);
    const introduction = result.document?.blocks.find((block) => block.type === "paragraph");
    expect(introduction?.type === "paragraph" ? introduction.text : "").toContain(primaryKeyword);
    expect(result.document?.metadata?.metaDescription).toContain(primaryKeyword);

    const baselineSeo = result.baselineQuality?.dimensions.find((item) => item.category === "seo")?.score ?? 0;
    const candidateSeo = result.quality?.dimensions.find((item) => item.category === "seo")?.score ?? 0;
    expect(candidateSeo).toBeGreaterThan(baselineSeo);
    expect(candidateSeo).toBeGreaterThanOrEqual(95);
    expect(result.improvement?.accepted).toBe(true);
    expect(result.document?.blocks.map((block) => block.id)).toEqual(document.blocks.map((block) => block.id));
  });
});
