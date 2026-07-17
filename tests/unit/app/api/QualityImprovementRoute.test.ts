import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { contentRevisionId } from "../../../../core/quality";

const baseDocument = createDocument();
const userData = {
  workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: [], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
  brands: [],
  projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
  contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: baseDocument.title, body: "", status: "in_review", createdAt: "now", updatedAt: "now", contentType: "article", platform: "tistory", primaryKeyword: "장내 마이크로바이옴 정신 건강", searchIntent: "장내 마이크로바이옴과 정신 건강의 관계 이해", document: baseDocument }],
  qualityReports: [],
};

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: { get: vi.fn(async () => userData), set: vi.fn() },
}));

import { studioStore } from "../../../../app/application/studio-store";
import { POST } from "../../../../app/api/studio/route";

describe("quality improvement route gate", () => {
  beforeEach(() => {
    vi.mocked(studioStore.get).mockResolvedValue(userData as never);
    vi.mocked(studioStore.set).mockClear();
  });

  it("rejects a submitted improvement that lowers quality and preserves the stored revision", async () => {
    const candidate: ContentDocument = {
      ...baseDocument,
      metadata: undefined,
      title: "일반적인 건강 정보",
      blocks: baseDocument.blocks.map((block) => block.type === "paragraph" ? { ...block, text: block.text.repeat(4) } : block),
    };

    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept-improvement", input: { workspaceId: "workspace-1", contentId: "content-1", basedOnRevisionId: contentRevisionId(baseDocument), document: candidate } }),
    }));
    const result = await response.json() as { error?: string };

    expect(response.status).toBe(400);
    expect(result.error).toContain("좋아지지 않아 적용하지 않았습니다");
    expect(vi.mocked(studioStore.set)).not.toHaveBeenCalled();
  });
});

function createDocument(): ContentDocument {
  const paragraph = "장내 마이크로바이옴 정신 건강의 관계를 이해하려면 장과 뇌가 신경·면역·대사 신호를 주고받는 과정을 함께 살펴봐야 합니다. 특정 균 하나를 만능 해결책으로 보지 않고 식사와 수면, 활동량을 함께 관리하는 것이 현실적입니다. ";
  const blocks: ContentDocument["blocks"] = [
    { id: "intro", type: "paragraph", text: paragraph.repeat(2) },
    ...Array.from({ length: 5 }, (_, index) => ([
      { id: `h-${index}`, type: "heading" as const, level: 2 as const, text: `장 건강 확인 기준 ${index + 1}` },
      { id: `p-${index}`, type: "paragraph" as const, text: `${index + 1}번째 기준을 설명합니다. ${paragraph.repeat(3)}` },
    ])).flat(),
    { id: "image", type: "image", source: "", alt: "장과 뇌가 신호를 주고받는 장-뇌 축 개념도" },
    { id: "internal", type: "button", purpose: "internal_link", label: "장-뇌 축 기본 개념 보기", targetUrl: "https://bright-health.tistory.com/entry/gut-brain", target: "_self", sourceExternalPostId: "gut-brain" },
    { id: "conclusion", type: "paragraph", text: `결론에서는 생활 습관을 함께 점검하고 필요한 경우 전문가의 평가를 받는 기준을 정리합니다. ${paragraph}` },
    ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `함께 보면 도움이 되는 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/help-${index + 1}`, target: "_self" as const, sourceExternalPostId: `help-${index + 1}` })),
  ];
  return {
    id: "content-1",
    title: "장내 마이크로바이옴 정신 건강, 연결 원리와 생활 관리",
    metadata: { buttonCount: 4, createdAt: "now", generator: "test", imageCount: 1, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1000, metaDescription: "장내 마이크로바이옴 정신 건강의 연결 원리와 식사, 수면, 활동 관리 기준을 구체적으로 설명하고 과도한 치료 기대를 피하는 방법을 안내합니다.", primarySearchIntent: "장내 마이크로바이옴과 정신 건강의 관계 이해" },
    blocks,
  };
}
