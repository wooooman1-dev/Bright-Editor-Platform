import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  findById: vi.fn(),
  listByWorkspace: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  listByProject: vi.fn(),
  saveTarget: vi.fn(),
  deleteTargetsByConnection: vi.fn(),
  getState: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: {
    findById: runtime.findById,
    listByWorkspace: runtime.listByWorkspace,
    save: runtime.saveConnection,
    delete: runtime.deleteConnection,
  },
  targetRepository: {
    listByProject: runtime.listByProject,
    save: runtime.saveTarget,
    deleteByConnection: runtime.deleteTargetsByConnection,
  },
  connectionJobRunner: {
    status: vi.fn(),
    start: vi.fn(),
    cancel: vi.fn(),
  },
  connectionRoot: ".bright-studio/connections",
  secretStore: {
    storeSecret: vi.fn(),
    readSecret: vi.fn(),
    deleteSecret: vi.fn(),
  },
}));

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: {
    get: runtime.getState,
    set: runtime.setState,
  },
}));

import { POST } from "../../../../app/api/connections/route";
import type { PlatformConnection } from "../../../../core/connections";
import type { UserData } from "../../../../app/user-flow/user-data";

const oldConnection: PlatformConnection = {
  id: "connection-old",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-healthy",
  status: "disconnected",
  publicMetadata: {
    blogId: "bright-healthy",
    blogUrl: "https://bright-healthy.tistory.com",
    sessionStateAvailable: false,
  },
  createdAt: "before",
  updatedAt: "before",
  selectedAsDefault: false,
  version: 1,
};

const newConnection: PlatformConnection = {
  ...oldConnection,
  id: "connection-new",
  status: "connected",
  publicMetadata: {
    ...oldConnection.publicMetadata,
    sessionStateAvailable: true,
  },
};

const state: UserData = {
  workspace: { id: "workspace-1", name: "Workspace" },
  brands: [],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Health",
    description: "",
    selectedPublishingAccountIds: [oldConnection.id],
    createdAt: "before",
    updatedAt: "before",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "원고",
    body: "본문",
    status: "ready",
    updatedAt: "before",
    selectedPublishingAccountIds: [oldConnection.id],
    publishingAccountId: oldConnection.id,
    publishingPreparation: {
      tistory: {
        publishingAccountId: oldConnection.id,
        platformCategoryId: "category-health",
        platformCategoryName: "건강정보",
        updatedAt: "before",
      },
    },
  }],
};

describe("connection reference migration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.getState.mockResolvedValue(state);
    runtime.findById.mockImplementation(async (id: string) => id === oldConnection.id ? oldConnection : id === newConnection.id ? newConnection : undefined);
    runtime.listByProject.mockResolvedValue([{ projectId: "project-1", platformConnectionId: oldConnection.id, platform: "tistory", selectedAt: "before" }]);
    runtime.saveTarget.mockResolvedValue(undefined);
    runtime.setState.mockResolvedValue(undefined);
    runtime.deleteTargetsByConnection.mockResolvedValue(undefined);
    runtime.deleteConnection.mockResolvedValue(undefined);
  });

  it("moves active references and creates the replacement target before deleting old metadata", async () => {
    const response = await POST(new Request("http://localhost/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "migrate-delete-connection",
        workspaceId: "workspace-1",
        connectionId: oldConnection.id,
        replacementConnectionId: newConnection.id,
        confirmation: oldConnection.displayName,
      }),
    }));
    const result = await response.json() as {
      migrated?: boolean;
      projectCount?: number;
      contentCount?: number;
      replacementConnectionId?: string;
      error?: string;
    };

    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result).toMatchObject({
      migrated: true,
      projectCount: 1,
      contentCount: 1,
      replacementConnectionId: newConnection.id,
    });

    const savedData = runtime.setState.mock.calls[0]?.[2] as UserData;
    expect(savedData.projects[0].selectedPublishingAccountIds).toEqual([newConnection.id]);
    expect(savedData.contents[0].publishingAccountId).toBe(newConnection.id);
    expect(savedData.contents[0].publishingPreparation?.tistory).toMatchObject({
      publishingAccountId: newConnection.id,
      platformCategoryId: "category-health",
      platformCategoryName: "건강정보",
    });
    expect(runtime.saveTarget).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      platformConnectionId: newConnection.id,
    }));
    expect(runtime.deleteTargetsByConnection).toHaveBeenCalledWith(oldConnection.id);
    expect(runtime.deleteConnection).toHaveBeenCalledWith(oldConnection.id);

    const targetSavedAt = runtime.saveTarget.mock.invocationCallOrder[0];
    const dataSavedAt = runtime.setState.mock.invocationCallOrder[0];
    const oldTargetDeletedAt = runtime.deleteTargetsByConnection.mock.invocationCallOrder[0];
    const oldConnectionDeletedAt = runtime.deleteConnection.mock.invocationCallOrder[0];
    expect(targetSavedAt).toBeLessThan(dataSavedAt);
    expect(dataSavedAt).toBeLessThan(oldTargetDeletedAt);
    expect(oldTargetDeletedAt).toBeLessThan(oldConnectionDeletedAt);
  });

  it("rejects a connected replacement without a verified Tistory session before changing data", async () => {
    runtime.findById.mockImplementation(async (id: string) => id === oldConnection.id
      ? oldConnection
      : id === newConnection.id
        ? { ...newConnection, publicMetadata: { ...newConnection.publicMetadata, sessionStateAvailable: false } }
        : undefined);

    const response = await POST(new Request("http://localhost/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "migrate-delete-connection",
        workspaceId: "workspace-1",
        connectionId: oldConnection.id,
        replacementConnectionId: newConnection.id,
        confirmation: oldConnection.displayName,
      }),
    }));
    const result = await response.json() as { error?: string };

    expect(response.status).toBe(400);
    expect(result.error).toContain("verified stored session");
    expect(runtime.setState).not.toHaveBeenCalled();
    expect(runtime.deleteTargetsByConnection).not.toHaveBeenCalled();
    expect(runtime.deleteConnection).not.toHaveBeenCalled();
  });
});
