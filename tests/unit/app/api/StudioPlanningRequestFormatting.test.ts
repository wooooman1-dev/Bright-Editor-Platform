import { afterEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }));
const dataSourceMocks = vi.hoisted(() => ({
  connections: { listByWorkspace: vi.fn().mockResolvedValue([]) },
  references: { listByProject: vi.fn().mockResolvedValue([]) },
  evidence: { findById: vi.fn(), listByWorkspace: vi.fn().mockResolvedValue([]), saveMany: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: storeMocks }));
vi.mock("../../../../app/application/data-sources/data-source-runtime", () => ({
  dataSourceConnectionRepository: dataSourceMocks.connections,
  projectDataSourceReferenceRepository: dataSourceMocks.references,
  opportunityEvidenceRepository: dataSourceMocks.evidence,
}));

import { POST } from "../../../../app/api/studio/route";
import type { UserData } from "../../../../app/user-flow/user-data";

describe("studio planning request formatting", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("preserves multiline request formatting across start-planning and plan", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    let current: UserData = {
      workspace: {
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
      },
      brands: [],
      projects: [{
        id: "project-1",
        workspaceId: "workspace-1",
        name: "Health",
        description: "건강정보 콘텐츠",
        createdAt: "now",
        updatedAt: "now",
      }],
      contents: [],
      qualityReports: [],
    };
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => {
      current = updater(current);
      return current;
    });

    const request = "  건강정보 프로젝트에서 아직 다루지 않은 주제를 선정해 줘.\n\n세부   조건과 문단 구성을 유지해 줘.  ";
    const operationId = "planning-format-1";
    const startResponse = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start-planning",
        input: {
          naturalLanguageRequest: request,
          workspaceId: "workspace-1",
          projectId: "project-1",
          contentId: "content-1",
          operationId,
          selectionMode: "automatic",
        },
      }),
    }));

    expect(startResponse.status).toBe(200);
    expect(current.contents[0].planningWorkflow?.request).toBe(request.trim());
    expect(current.contents[0].planningWorkflow?.request).toContain("\n\n");
    expect(current.contents[0].planningWorkflow?.request).toContain("세부   조건");

    const planningResult = {
      interpretedIntent: request.trim(),
      domain: "health",
      targetAudience: "일반 독자",
      contentGoal: "건강정보 프로젝트의 미작성 주제 안내",
      recommendedPrimaryKeyword: "건강정보 미작성 주제",
      keywordCandidates: ["건강정보 미작성 주제"],
      searchIntent: "informational",
      recommendedContentType: "guide",
      recommendedPlatforms: ["tistory"],
      suggestedTitleAngles: ["건강정보 프로젝트에서 아직 다루지 않은 주제"],
      relatedKeywords: ["건강정보"],
      contentCluster: ["건강"],
      recommendationReason: "프로젝트 설명과 요청에 맞는 주제입니다.",
      confidence: 0.9,
      estimateDisclosure: "AI estimate",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(planningResult),
    }), { status: 200 }));

    const planResponse = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "plan",
        input: {
          naturalLanguageRequest: request,
          workspaceId: "workspace-1",
          projectId: "project-1",
          contentId: "content-1",
          operationId,
          selectionMode: "automatic",
        },
      }),
    }));
    const result = await planResponse.json() as { error?: string; data?: UserData };

    expect(planResponse.status, result.error).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.data?.contents[0].planningWorkflow).toMatchObject({
      status: "candidatesReady",
      operationId,
      lastSuccessfulStep: "planning",
    });
  });
});
