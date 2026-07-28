import { beforeEach, describe, expect, it, vi } from "vitest";

const preparationMocks = vi.hoisted(() => ({
  calculateTistoryReadiness: vi.fn(),
}));
vi.mock("../../../../../app/application/publishing/TistoryPublishingPreparation", () => ({
  calculateTistoryReadiness: preparationMocks.calculateTistoryReadiness,
}));

import { calculateTistoryScheduleReadiness } from "../../../../../app/application/publishing/TistoryScheduleReadiness";
import { safeDraftPermissions, type PlatformConnection } from "../../../../../core/connections";
import type { ScheduledPublication } from "../../../../../core/publishing";
import type { UserContent, UserData, UserProject } from "../../../../../app/user-flow/user-data";

const NOW = new Date("2026-07-28T07:00:00.000Z");

const data: UserData = {
  workspace: { id: "workspace-1", name: "Studio" },
  brands: [],
  projects: [],
  contents: [],
};

const project: UserProject = {
  id: "project-1",
  workspaceId: "workspace-1",
  name: "Project",
  description: "",
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

const content: UserContent = {
  id: "content-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  title: "Article",
  body: "",
  status: "ready",
  updatedAt: NOW.toISOString(),
};

function connection(permissions: readonly string[] = [...safeDraftPermissions, "schedule.create"]): PlatformConnection {
  return {
    id: "connection-1",
    workspaceId: "workspace-1",
    platform: "tistory",
    displayName: "bright-health",
    status: "connected",
    publicMetadata: { sessionStateAvailable: true },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    lastVerifiedAt: NOW.toISOString(),
    selectedAsDefault: true,
    version: 1,
    automationPermissions: permissions as PlatformConnection["automationPermissions"],
    publishingPolicy: "review_first",
  };
}

function activeSchedule(): ScheduledPublication {
  return {
    id: "schedule-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    platform: "tistory",
    platformConnectionId: "connection-1",
    revisionId: "revision-1",
    scheduledAt: "2026-07-29T09:00:00+09:00",
    timezone: "Asia/Seoul",
    status: "scheduled_verified",
    categoryId: null,
    categoryName: null,
    requestFingerprint: "fingerprint-1",
    operationId: "operation-1",
    attemptCount: 1,
    lastAttemptAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function input(overrides: Partial<Parameters<typeof calculateTistoryScheduleReadiness>[0]> = {}) {
  return {
    data,
    project,
    content,
    connection: connection(),
    selectedTarget: true,
    scheduledAt: "2026-07-29T09:00:00+09:00",
    timezone: "Asia/Seoul",
    finalConfirmation: true,
    scheduledPublishing: [],
    now: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  preparationMocks.calculateTistoryReadiness.mockResolvedValue({
    ready: true,
    checks: [
      { key: "enabled_tistory", passed: true, message: "enabled" },
      { key: "publishing_account", passed: true, message: "account" },
      { key: "category", passed: true, message: "category" },
      { key: "quality", passed: true, message: "quality" },
      { key: "media_upload_permission", passed: true, message: "media" },
      { key: "draft_only", passed: true, message: "draft only" },
      { key: "review_first", passed: true, message: "review first" },
      { key: "permission_gate", passed: true, message: "draft permission" },
      { key: "final_confirmation", passed: true, message: "draft confirmation" },
    ],
  });
});

describe("Tistory schedule readiness", () => {
  it("passes schedule-specific gates without reusing draft permission", async () => {
    const result = await calculateTistoryScheduleReadiness(input());

    expect(result.ready).toBe(true);
    expect(result.executable).toBe(true);
    expect(result.checks.some((check) => check.key === "permission_gate")).toBe(false);
    expect(result.checks.find((check) => check.key === "schedule_permission")?.passed).toBe(true);
  });

  it("keeps readiness separate from final execution confirmation", async () => {
    const result = await calculateTistoryScheduleReadiness(input({ finalConfirmation: false }));

    expect(result.ready).toBe(true);
    expect(result.executable).toBe(false);
    expect(result.checks.find((check) => check.key === "final_confirmation")?.passed).toBe(false);
  });

  it("blocks accounts without explicit schedule permission", async () => {
    const result = await calculateTistoryScheduleReadiness(input({ connection: connection(safeDraftPermissions) }));

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.key === "schedule_permission")?.passed).toBe(false);
  });

  it("blocks past or timezone-free schedule values", async () => {
    const result = await calculateTistoryScheduleReadiness(input({ scheduledAt: "2026-07-28T06:59:00.000Z" }));

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.key === "schedule_time")?.passed).toBe(false);
  });

  it("blocks a second active schedule for the same content", async () => {
    const result = await calculateTistoryScheduleReadiness(input({ scheduledPublishing: [activeSchedule()] }));

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.key === "active_schedule")?.passed).toBe(false);
  });

  it("requires stored approval readiness for approval-mode content", async () => {
    const approvalContent = { ...content, contentPurpose: "adsense_approval" } as UserContent;
    const result = await calculateTistoryScheduleReadiness(input({ content: approvalContent }));

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.key === "approval_readiness")?.passed).toBe(false);
  });
});
