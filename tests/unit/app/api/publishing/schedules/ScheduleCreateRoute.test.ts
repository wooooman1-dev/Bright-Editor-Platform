import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn() }));
const connectionMocks = vi.hoisted(() => ({ findById: vi.fn() }));
const targetMocks = vi.hoisted(() => ({ listByProject: vi.fn() }));
const connectionStoreMocks = vi.hoisted(() => ({ set: vi.fn() }));
const settingsMocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  resolve: vi.fn(),
}));
const readinessMocks = vi.hoisted(() => ({ calculate: vi.fn() }));
const reservationMocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  beginAttempt: vi.fn(),
  transition: vi.fn(),
}));
const createMocks = vi.hoisted(() => ({ execute: vi.fn() }));
const adapterMocks = vi.hoisted(() => ({ prepare: vi.fn() }));
const qualityMocks = vi.hoisted(() => ({ revision: vi.fn() }));

vi.mock("../../../../../../app/application/studio-store", () => ({
  studioDataPath: "test-studio.json",
  studioStore: storeMocks,
}));
vi.mock("../../../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: connectionMocks,
  targetRepository: targetMocks,
  connectionStore: connectionStoreMocks,
}));
vi.mock("../../../../../../app/application/settings/WorkspaceSettingsService", () => ({
  isPlatformEnabled: settingsMocks.enabled,
  resolveWorkspaceSettings: settingsMocks.resolve,
}));
vi.mock("../../../../../../app/application/publishing/TistoryScheduleReadiness", () => ({
  calculateTistoryScheduleReadiness: readinessMocks.calculate,
}));
vi.mock("../../../../../../app/application/publishing/ScheduledPublishingApplicationService", () => ({
  ScheduledPublishingApplicationService: class {
    reserve = reservationMocks.reserve;
    beginAttempt = reservationMocks.beginAttempt;
    transition = reservationMocks.transition;
  },
}));
vi.mock("../../../../../../app/application/publishing/TistoryScheduleCreateApplicationService", () => ({
  TistoryScheduleCreateApplicationService: class {
    execute = createMocks.execute;
  },
}));
vi.mock("../../../../../../apps/tistory/publishing/TistoryPublishingAdapter", () => ({
  TistoryPublishingAdapter: class {
    prepare = adapterMocks.prepare;
  },
}));
vi.mock("../../../../../../core/quality", () => ({
  contentRevisionId: qualityMocks.revision,
}));

import { POST } from "../../../../../../app/api/publishing/schedules/create/route";

const SCHEDULED_AT = "2026-07-29T09:00:00+09:00";
const document = {
  id: "document-1",
  title: "예약 테스트 글",
  blocks: [{ id: "paragraph-1", type: "paragraph", text: "예약 테스트 본문입니다." }],
};
const data = {
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
    },
  },
  brands: [],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Project",
    selectedPublishingAccountIds: ["connection-1"],
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "예약 테스트 글",
    body: "",
    status: "ready",
    document,
    publishingAccountId: "connection-1",
    selectedPublishingAccountIds: ["connection-1"],
    publishingPreparation: {
      tistory: {
        publishingAccountId: "connection-1",
        platformCategoryId: "100",
        platformCategoryName: "건강정보",
        updatedAt: "2026-07-28T00:00:00.000Z",
      },
    },
    updatedAt: "2026-07-28T00:00:00.000Z",
  }],
  scheduledPublishing: [],
};
const connection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-healthy",
  status: "connected",
  publicMetadata: { blogId: "bright-healthy", sessionStateAvailable: true },
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  lastVerifiedAt: "2026-07-28T00:00:00.000Z",
  selectedAsDefault: true,
  version: 1,
  automationPermissions: ["schedule.create"],
  publishingPolicy: "review_first",
};

function schedule(status: string = "registering") {
  return {
    id: "schedule-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    platform: "tistory",
    platformConnectionId: "connection-1",
    revisionId: "revision-1",
    scheduledAt: SCHEDULED_AT,
    timezone: "Asia/Seoul",
    status,
    categoryId: "100",
    categoryName: "건강정보",
    requestFingerprint: "fingerprint-1",
    operationId: "operation-1",
    attemptCount: 1,
    lastAttemptAt: "2026-07-28T00:00:00.000Z",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/publishing/schedules/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      connectionId: "connection-1",
      scheduledAt: SCHEDULED_AT,
      timezone: "Asia/Seoul",
      finalConfirmation: true,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.get.mockResolvedValue(data);
  connectionMocks.findById.mockResolvedValue(connection);
  targetMocks.listByProject.mockResolvedValue([{ platformConnectionId: "connection-1" }]);
  settingsMocks.enabled.mockReturnValue(true);
  settingsMocks.resolve.mockReturnValue({
    publishing: {
      reviewFirst: true,
      draftOnly: true,
      publicPublish: false,
      sequentialDraftSave: true,
      qualityApprovalRequired: true,
    },
  });
  readinessMocks.calculate.mockResolvedValue({ ready: true, executable: true, checks: [] });
  qualityMocks.revision.mockReturnValue("revision-1");
  adapterMocks.prepare.mockResolvedValue({
    payload: {
      title: "예약 테스트 글",
      html: "<p>예약 테스트 본문입니다.</p>",
      tags: ["예약", "테스트"],
      type: "save-draft",
    },
    platform: "tistory",
  });
  reservationMocks.reserve.mockResolvedValue({
    created: true,
    reservation: schedule("registering"),
  });
  reservationMocks.beginAttempt.mockResolvedValue(schedule("registering"));
  createMocks.execute.mockResolvedValue({
    status: "scheduled_verified",
    workflow: "schedule.create",
    finalClickIssued: true,
    registeredAt: "2026-07-28T01:00:00.000Z",
    verifiedAt: "2026-07-28T01:01:00.000Z",
    externalPostId: "12345",
    externalManagementUrl: "https://bright-healthy.tistory.com/manage/posts/",
  });
  reservationMocks.transition.mockResolvedValue(schedule("scheduled_verified"));
});

describe("Tistory schedule create API", () => {
  it("reserves the current revision and executes the dedicated schedule worker", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schedule.status).toBe("scheduled_verified");
    expect(reservationMocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      platformConnectionId: "connection-1",
      revisionId: "revision-1",
      scheduledAt: SCHEDULED_AT,
      timezone: "Asia/Seoul",
      categoryId: "100",
    }));
    expect(reservationMocks.beginAttempt).toHaveBeenCalledTimes(1);
    expect(createMocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      title: "예약 테스트 글",
      html: "<p>예약 테스트 본문입니다.</p>",
      scheduledAt: SCHEDULED_AT,
      finalConfirmation: true,
    }));
    expect(reservationMocks.transition).toHaveBeenCalledWith(expect.objectContaining({
      status: "scheduled_verified",
      externalPostId: "12345",
    }));
  });

  it("stops before reservation and Playwright when readiness is not executable", async () => {
    readinessMocks.calculate.mockResolvedValue({
      ready: false,
      executable: false,
      checks: [{ key: "quality", passed: false, message: "품질 승인 필요" }],
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.readiness.executable).toBe(false);
    expect(reservationMocks.reserve).not.toHaveBeenCalled();
    expect(createMocks.execute).not.toHaveBeenCalled();
  });

  it("returns an active identical reservation without issuing another external registration", async () => {
    reservationMocks.reserve.mockResolvedValue({
      created: false,
      reservation: schedule("scheduled_unverified"),
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("existing");
    expect(body.result.schedule.status).toBe("scheduled_unverified");
    expect(reservationMocks.beginAttempt).not.toHaveBeenCalled();
    expect(createMocks.execute).not.toHaveBeenCalled();
  });

  it("retries an identical failed reservation only after this explicit user request", async () => {
    reservationMocks.reserve.mockResolvedValue({
      created: false,
      reservation: schedule("failed"),
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(reservationMocks.beginAttempt).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
    });
    expect(createMocks.execute).toHaveBeenCalledTimes(1);
  });

  it("transitions an ambiguous final-click result to scheduled_unverified", async () => {
    createMocks.execute.mockResolvedValue({
      status: "scheduled_unverified",
      workflow: "schedule.create",
      finalClickIssued: true,
      registeredAt: "2026-07-28T01:00:00.000Z",
      diagnosticCode: "TISTORY_SCHEDULE_EXTERNAL_VERIFICATION_PENDING",
      error: "외부 상태 확인 필요",
    });
    reservationMocks.transition.mockResolvedValue(schedule("scheduled_unverified"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(reservationMocks.transition).toHaveBeenCalledWith(expect.objectContaining({
      status: "scheduled_unverified",
      failureCode: "TISTORY_SCHEDULE_EXTERNAL_VERIFICATION_PENDING",
    }));
  });

  it("requires final user confirmation before any server mutation", async () => {
    const response = await POST(request({ finalConfirmation: false }));

    expect(response.status).toBe(400);
    expect(storeMocks.get).not.toHaveBeenCalled();
    expect(reservationMocks.reserve).not.toHaveBeenCalled();
    expect(createMocks.execute).not.toHaveBeenCalled();
  });
});