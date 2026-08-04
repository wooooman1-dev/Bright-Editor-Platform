import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  references: [] as Array<Readonly<{ workspaceId: string; projectId: string; connectionId: string; enabled: boolean; updatedAt?: string }>>,
}));

const mocks = vi.hoisted(() => ({
  connectionFind: vi.fn(),
  connectionList: vi.fn(),
  connectionSave: vi.fn(),
  snapshotList: vi.fn(),
  referenceListWorkspace: vi.fn(),
  referenceSave: vi.fn(),
  referenceDelete: vi.fn(),
  syncStart: vi.fn(),
  syncStatus: vi.fn(),
  studioGet: vi.fn(),
  oauthConfigured: vi.fn(),
  oauthInvalidate: vi.fn(),
  oauthRevoke: vi.fn(),
  dataSourceDelete: vi.fn(),
  storeSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

vi.mock("../../../../app/application/data-sources/data-source-runtime", () => ({
  dataSourceConnectionRepository: {
    findById: mocks.connectionFind,
    listByWorkspace: mocks.connectionList,
    save: mocks.connectionSave,
  },
  dataSourceDeletionService: { delete: mocks.dataSourceDelete },
  dataSourceSnapshotRepository: { listByWorkspace: mocks.snapshotList },
  dataSourceSyncService: { start: mocks.syncStart, status: mocks.syncStatus },
  googleOAuthClientFactory: { configured: mocks.oauthConfigured },
  googleOAuthCredentialService: { revoke: mocks.oauthRevoke },
  googleOAuthStateStore: { invalidate: mocks.oauthInvalidate },
  projectDataSourceReferenceRepository: {
    listByWorkspace: mocks.referenceListWorkspace,
    save: mocks.referenceSave,
    delete: mocks.referenceDelete,
  },
}));

vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  secretStore: {
    storeSecret: mocks.storeSecret,
    deleteSecret: mocks.deleteSecret,
  },
}));

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: { get: mocks.studioGet },
}));

import { POST } from "../../../../app/api/data-sources/route";

const connection = Object.freeze({
  id: "connection-health",
  workspaceId: "workspace-1",
  provider: "googleSearchConsole" as const,
  displayName: "GSC · 건강 정보",
  status: "ready" as const,
  secretReference: "secret-reference",
  credentialMode: "googleOAuth" as const,
  resourceConfiguration: Object.freeze({ siteProperty: "https://bright-healthy.tistory.com/" }),
  enabled: true,
  createdAt: "2026-07-23T01:30:35.911Z",
  updatedAt: "2026-07-23T01:30:58.526Z",
  version: 1,
});

function assignmentRequest(projectId: string, enabled = true) {
  return new Request("http://localhost/api/data-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "set-project-reference",
      workspaceId: "workspace-1",
      projectId,
      connectionId: connection.id,
      enabled,
    }),
  });
}

describe("Data Source Project reference scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.references.length = 0;
    mocks.studioGet.mockResolvedValue({
      workspace: { id: "workspace-1" },
      projects: [
        { id: "project-health", workspaceId: "workspace-1", name: "건강 정보" },
        { id: "project-finance", workspaceId: "workspace-1", name: "밝은재테크" },
      ],
    });
    mocks.connectionFind.mockResolvedValue(connection);
    mocks.connectionList.mockResolvedValue([connection]);
    mocks.snapshotList.mockResolvedValue([]);
    mocks.referenceListWorkspace.mockImplementation(async () => [...state.references]);
    mocks.referenceSave.mockImplementation(async (value) => {
      state.references.push(value);
    });
    mocks.referenceDelete.mockImplementation(async (projectId: string, connectionId: string) => {
      const index = state.references.findIndex((value) => value.projectId === projectId && value.connectionId === connectionId);
      if (index >= 0) state.references.splice(index, 1);
    });
    mocks.oauthConfigured.mockReturnValue(false);
  });

  it("rejects assigning a Connection that is already owned by another Project", async () => {
    state.references.push({
      workspaceId: "workspace-1",
      projectId: "project-health",
      connectionId: connection.id,
      enabled: true,
      updatedAt: "2026-07-23T01:30:58.526Z",
    });

    const response = await POST(assignmentRequest("project-finance"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "DATA_SOURCE_CONFLICT",
      field: "connectionId",
      error: expect.stringContaining("건강 정보 Project에서 사용 중"),
    });
    expect(mocks.referenceSave).not.toHaveBeenCalled();
  });

  it("serializes concurrent assignment requests so only one Project can win", async () => {
    const [first, second] = await Promise.all([
      POST(assignmentRequest("project-health")),
      POST(assignmentRequest("project-finance")),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(state.references).toHaveLength(1);
    expect(new Set(state.references.map((value) => value.projectId)).size).toBe(1);
    expect(mocks.referenceSave).toHaveBeenCalledTimes(1);
  });

  it("keeps an idempotent assignment to the same Project valid", async () => {
    state.references.push({
      workspaceId: "workspace-1",
      projectId: "project-health",
      connectionId: connection.id,
      enabled: true,
    });

    const response = await POST(assignmentRequest("project-health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ referenced: true });
    expect(mocks.referenceSave).toHaveBeenCalledTimes(1);
  });
});
