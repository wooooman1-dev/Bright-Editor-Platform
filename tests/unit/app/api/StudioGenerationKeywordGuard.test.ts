import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmContentOpportunity, createContentOpportunityCandidate } from "../../../../core/content";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "장 건강 글", selectionMode: "userSpecified", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["장내 환경"], searchIntent: "장 건강 개선 방법 탐색", audience: "일반 성인", contentType: "article",
  contentAngle: "실천 방법", readerProblem: "관리 기준 부족", expectedCoverage: ["장내 환경"], selectionRationale: "사용자 지정",
  opportunityEvidence: [{ source: "unknown", summary: "검색량 데이터 없음" }], confidence: 0.8, cautions: [], projectId: "project-1",
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });
const baseData = {
  workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: [], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
  brands: [],
  projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
  contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: "기획", body: "", status: "planning", updatedAt: "now", primaryKeyword: "장 건강 관리 방법", relatedKeywords: ["장내 환경"], searchIntent: opportunity.searchIntent, opportunity }],
};

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: { get: vi.fn(), set: vi.fn(), update: vi.fn() },
}));
vi.mock("../../../../app/application/OpenAIProvider", () => ({
  OpenAIProvider: class { generate = generate; },
}));

import { studioStore } from "../../../../app/application/studio-store";
import { POST } from "../../../../app/api/studio/route";

describe("Studio generate confirmed keyword guard", () => {
  beforeEach(() => {
    generate.mockClear();
    vi.mocked(studioStore.get).mockResolvedValue(baseData as never);
  });


  it("rejects generation when the owned Content has no confirmed keyword", async () => {
    vi.mocked(studioStore.get).mockResolvedValue({ ...baseData, contents: [{ ...baseData.contents[0], primaryKeyword: undefined, opportunity: undefined }] } as never);

    const response = await requestGenerate(["장 건강 관리 방법"]);
    const result = await response.json() as { error?: string };

    expect(response.status).toBe(400);
    expect(result.error).toBe("콘텐츠 기회를 먼저 선택해 주세요.");
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["opportunityId", "opportunity-other"],
    ["opportunityVersion", 2],
    ["opportunityFingerprint", "fp-stale"],
  ])("rejects a mismatched %s before any AI call", async (field, value) => {
    const response = await requestGenerate([opportunity.primaryKeyword, ...opportunity.secondaryKeywords], { [field]: value });
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
});

function requestGenerate(keywords: readonly string[], overrides: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "generate", input: { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", contentType: "article", platform: "canonical", opportunityId: opportunity.opportunityId, opportunityVersion: opportunity.version, opportunityFingerprint: opportunity.fingerprint, primaryKeyword: keywords[0], topic: opportunity.selectedTopic, searchIntent: opportunity.searchIntent, secondaryKeywords: opportunity.secondaryKeywords, keywords, ...overrides } }),
  }));
}
