import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn() }));
const connectionMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  listByWorkspace: vi.fn(),
}));
const targetMocks = vi.hoisted(() => ({ listByProject: vi.fn() }));
const connectionStoreMocks = vi.hoisted(() => ({ set: vi.fn() }));
const probeMocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../../../../../../app/application/studio-store", () => ({
  studioStore: storeMocks,
}));
vi.mock(
  "../../../../../../app/application/connections/connection-runtime",
  () => ({
    connectionRepository: connectionMocks,
    targetRepository: targetMocks,
    connectionStore: connectionStoreMocks,
  }),
);
vi.mock(
  "../../../../../../app/application/publishing/TistorySchedulePanelProbeApplicationService",
  () => ({
    TistorySchedulePanelProbeApplicationService: class {
      execute = probeMocks.execute;
    },
  }),
);

import { POST } from "../../../../../../app/api/publishing/schedules/panel-probe/route";
import type { UserData } from "../../../../../../app/user-flow/user-data";

const data: UserData = {
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
    name: "Project",
    description: "",
    selectedPublishingAccountIds: ["connection-1"],
    createdAt: "2026-07-28T10:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    publishingAccountId: "connection-1",
    selectedPublishingAccountIds: ["connection-1"],
    title: "Article",
    body: "",
    status: "ready",
    updatedAt: "2026-07-28T10:00:00.000Z",
  }],
  scheduledPublishing: [],
};

const connection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-healthy",
  status: "connected",
  publicMetadata: {
    blogId: "bright-healthy",
    sessionStateAvailable: true,
  },
  createdAt: "2026-07-28T10:00:00.000Z",
  updatedAt: "2026-07-28T10:00:00.000Z",
  selectedAsDefault: true,
  version: 1,
  automationPermissions: ["schedule.create"],
  publishingPolicy: "review_first",
};

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/publishing/schedules/panel-probe",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const validBody = {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  connectionName: "bright-healthy",
};

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.get.mockResolvedValue(data);
  connectionMocks.findById.mockResolvedValue(connection);
  connectionMocks.listByWorkspace.mockResolvedValue([connection]);
  targetMocks.listByProject.mockResolvedValue([
    { platformConnectionId: "connection-1" },
  ]);
  probeMocks.execute.mockResolvedValue({
    status: "diagnosed",
    workflow: "schedule.verify",
    probeStage: "publication-panel",
    readOnly: true,
    clickCounts: {
      total: 1,
      allowedOpen: 1,
      restricted: 0,
      targets: [{ id: "publish-layer-btn" }],
    },
  });
});

describe("Tistory schedule panel probe API", () => {
  it("passes server-owned context to the bounded panel probe service", async () => {
    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({
      status: "diagnosed",
      probeStage: "publication-panel",
    });
    expect(probeMocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        projectId: "project-1",
        contentId: "content-1",
        connection,
        selectedTarget: true,
      }),
    );
  });

  it("rejects an ambiguous account name before the service runs", async () => {
    connectionMocks.listByWorkspace.mockResolvedValue([
      connection,
      { ...connection, id: "connection-2" },
    ]);

    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/정확히 일치/);
    expect(probeMocks.execute).not.toHaveBeenCalled();
  });

  it("rejects public publishing policy before the service runs", async () => {
    storeMocks.get.mockResolvedValue({
      ...data,
      workspace: {
        ...data.workspace,
        settings: {
          ...data.workspace.settings,
          publishing: {
            ...data.workspace.settings?.publishing,
            publicPublish: true,
          },
        },
      },
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    expect(probeMocks.execute).not.toHaveBeenCalled();
  });

  it("rejects content outside the requested Project", async () => {
    const response = await POST(request({
      ...validBody,
      projectId: "project-other",
    }));

    expect(response.status).toBe(400);
    expect(probeMocks.execute).not.toHaveBeenCalled();
  });
});
