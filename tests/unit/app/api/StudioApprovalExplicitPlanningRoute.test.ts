import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));
const dataSourceMocks = vi.hoisted(() => ({
  connections: { listByWorkspace: vi.fn().mockResolvedValue([]) },
  references: { listByProject: vi.fn().mockResolvedValue([]) },
  evidence: {
    findById: vi.fn(),
    listByWorkspace: vi.fn().mockResolvedValue([]),
    saveMany: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: storeMocks,
}));
vi.mock("../../../../app/application/data-sources/data-source-runtime", () => ({
  dataSourceConnectionRepository: dataSourceMocks.connections,
  projectDataSourceReferenceRepository: dataSourceMocks.references,
  opportunityEvidenceRepository: dataSourceMocks.evidence,
}));

import { POST } from "../../../../app/api/studio/route";
import { explicitPlanningFormat } from "../../../../app/application/PlanningContracts";
import type { UserData } from "../../../../app/user-flow/user-data";
import { resolveApprovalPolicySnapshot } from "../../../../core/approval";

function approvalPlanningData(): UserData {
  const snapshot = resolveApprovalPolicySnapshot(
    "adsense_approval",
    "wordpress_life_economy_v1",
  );
  if (!snapshot) throw new Error("WordPress approval profile snapshot is required.");

  return {
    workspace: {
      id: "workspace-bright-finance",
      name: "Bright Studio",
      settings: {
        enabledPlatforms: ["wordpress"],
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
      id: "project-bright-finance",
      workspaceId: "workspace-bright-finance",
      name: "밝은재테크",
      description: "생활경제 승인 준비 콘텐츠",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }],
    contents: [{
      id: "content-bright-finance",
      workspaceId: "workspace-bright-finance",
      projectId: "project-bright-finance",
      title: "예금과 적금 차이 비교 및 선택 기준",
      body: "",
      status: "planning",
      contentPurpose: snapshot.contentPurpose,
      approvalPolicyId: snapshot.policyId,
      approvalPolicyVersion: snapshot.policyVersion,
      approvalProfileId: snapshot.profileId,
      approvalProfileVersion: snapshot.profileVersion,
      planningWorkflow: {
        status: "planning",
        request: "예금과 적금 차이 비교 및 선택 기준 글을 작성해줘",
        selectionMode: "userSpecified",
        operationId: "planning-operation-bright-finance",
        revision: 1,
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z",
        lastSuccessfulStep: "request",
      },
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }],
    qualityReports: [],
  } as UserData;
}

function openAIRequestBody(fetchSpy: ReturnType<typeof vi.spyOn>) {
  const body = fetchSpy.mock.calls[0]?.[1]?.body;
  expect(body).toBeInstanceOf(Uint8Array);
  return JSON.parse(new TextDecoder().decode(body as Uint8Array)) as {
    input?: string;
    text?: { format?: unknown };
  };
}

describe("studio approval explicit Planning route", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses explicit Verification Planning for Bright Finance approval Content without an environment flag", async () => {
    let current = approvalPlanningData();
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (
      _collection: string,
      _id: string,
      updater: (value: UserData | undefined) => UserData,
    ) => {
      current = updater(current);
      return current;
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 }),
    );

    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "plan",
        input: {
          naturalLanguageRequest: "예금과 적금 차이 비교 및 선택 기준 글을 작성해줘",
          workspaceId: "workspace-bright-finance",
          projectId: "project-bright-finance",
          contentId: "content-bright-finance",
          operationId: "planning-operation-bright-finance",
          selectionMode: "userSpecified",
        },
      }),
    }));

    expect(fetchSpy).toHaveBeenCalledOnce();
    const request = openAIRequestBody(fetchSpy);
    expect(request.text?.format).toEqual(explicitPlanningFormat);
    expect(request.input).toContain("Verification claims rule");
    expect(request.input).toContain("WordPress · 밝은재테크");
    expect(request.input).toContain("예금과 적금 차이 비교 및 선택 기준 글을 작성해줘");
    expect(response.status).toBe(400);
  });
});
