import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn() }));
const connectionMocks = vi.hoisted(() => ({ findById: vi.fn() }));
const targetMocks = vi.hoisted(() => ({ listByProject: vi.fn() }));
const readinessMocks = vi.hoisted(() => ({ calculate: vi.fn() }));

vi.mock("../../../../../../app/application/studio-store", () => ({ studioStore: storeMocks }));
vi.mock("../../../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: connectionMocks,
  targetRepository: targetMocks,
}));
vi.mock("../../../../../../app/application/publishing/TistoryScheduleReadiness", () => ({
  calculateTistoryScheduleReadiness: readinessMocks.calculate,
}));

import { POST } from "../../../../../../app/api/publishing/schedules/readiness/route";
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
    createdAt: "2026-07-28T07:00:00.000Z",
    updatedAt: "2026-07-28T07:00:00.000Z",
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
    updatedAt: "2026-07-28T07:00:00.000Z",
  }],
  scheduledPublishing: [],
};

const connection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-health",
  status: "connected",
  publicMetadata: { sessionStateAvailable: true },
  createdAt: "2026-07-28T07:00:00.000Z",
  updatedAt: "2026-07-28T07:00:00.000Z",
  selectedAsDefault: true,
  version: 1,
  automationPermissions: ["schedule.create"],
  publishingPolicy: "review_first",
};

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/publishing/schedules/readiness", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  connectionId: "connection-1",
  scheduledAt: "2026-07-29T09:00:00+09:00",
  timezone: "Asia/Seoul",
  finalConfirmation: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.get.mockResolvedValue(data);
  connectionMocks.findById.mockResolvedValue(connection);
  targetMocks.listByProject.mockResolvedValue([{ platformConnectionId: "connection-1" }]);
  readinessMocks.calculate.mockResolvedValue({ ready: true, executable: false, checks: [] });
});

describe("schedule readiness API", () => {
  it("resolves server-owned context before calculating readiness", async () => {
    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readiness).toEqual({ ready: true, executable: false, checks: [] });
    expect(readinessMocks.calculate).toHaveBeenCalledWith(expect.objectContaining({
      data,
      project: expect.objectContaining({ id: "project-1" }),
      content: expect.objectContaining({ id: "content-1" }),
      connection,
      selectedTarget: true,
      timezone: "Asia/Seoul",
    }));
  });

  it("rejects non-MVP timezones before readiness evaluation", async () => {
    const response = await POST(request({ ...validBody, timezone: "UTC" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Asia\/Seoul/);
    expect(readinessMocks.calculate).not.toHaveBeenCalled();
  });

  it("rejects a non-Tistory connection before readiness evaluation", async () => {
    connectionMocks.findById.mockResolvedValue({ ...connection, platform: "wordpress" });

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    expect(readinessMocks.calculate).not.toHaveBeenCalled();
  });

  it("rejects content outside the requested project", async () => {
    const response = await POST(request({ ...validBody, projectId: "project-other" }));

    expect(response.status).toBe(400);
    expect(readinessMocks.calculate).not.toHaveBeenCalled();
  });
});
