import { describe, expect, it } from "vitest";

import { ScheduledPublishingApplicationService, type ScheduleAwareUserData } from "../../../../../app/application/publishing/ScheduledPublishingApplicationService";
import { InMemoryPersistenceStore } from "../../../../../core/data";
import { isScheduledPublication, ScheduledPublicationError } from "../../../../../core/publishing";

const COLLECTION = "application";
const STATE_ID = "user-data";
const NOW = "2026-07-28T07:00:00.000Z";
const SCHEDULED_AT = "2026-07-29T09:00:00+09:00";

function data(): ScheduleAwareUserData {
  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Project",
      description: "",
      createdAt: NOW,
      updatedAt: NOW,
    }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "Scheduled article",
      body: "",
      status: "ready",
      updatedAt: NOW,
    }],
    scheduledPublishing: [],
  };
}

function input(overrides: Partial<Parameters<ScheduledPublishingApplicationService["reserve"]>[0]> = {}) {
  return {
    id: "schedule-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    platform: "tistory" as const,
    platformConnectionId: "connection-1",
    revisionId: "revision-1",
    scheduledAt: SCHEDULED_AT,
    timezone: "Asia/Seoul",
    categoryId: "category-1",
    categoryName: "건강정보",
    operationId: "operation-1",
    now: NOW,
    ...overrides,
  };
}

async function serviceWithData() {
  const store = new InMemoryPersistenceStore();
  await store.set(COLLECTION, STATE_ID, data());
  return { store, service: new ScheduledPublishingApplicationService(store, () => new Date(NOW)) };
}

describe("ScheduledPublishingApplicationService", () => {
  it("atomically reserves a rich server-owned schedule record", async () => {
    const { store, service } = await serviceWithData();

    const result = await service.reserve(input());

    expect(result.created).toBe(true);
    expect(result.reservation).toMatchObject({
      id: "schedule-1",
      status: "registering",
      contentId: "content-1",
      platformConnectionId: "connection-1",
      revisionId: "revision-1",
      scheduledAt: SCHEDULED_AT,
      timezone: "Asia/Seoul",
      categoryId: "category-1",
      categoryName: "건강정보",
      attemptCount: 0,
    });
    const stored = await store.get<ScheduleAwareUserData>(COLLECTION, STATE_ID);
    expect(stored?.scheduledPublishing).toHaveLength(1);
    expect(stored?.scheduledPublishing?.[0]).toEqual(result.reservation);
  });

  it("returns the existing record for the same deterministic request", async () => {
    const { service } = await serviceWithData();
    const first = await service.reserve(input());
    const second = await service.reserve(input({ id: "schedule-retry", operationId: "operation-retry" }));

    expect(second.created).toBe(false);
    expect(second.reservation).toEqual(first.reservation);
    expect(second.data.scheduledPublishing).toHaveLength(1);
  });

  it("blocks a second active schedule for the same content and platform", async () => {
    const { service } = await serviceWithData();
    await service.reserve(input());

    await expect(service.reserve(input({
      id: "schedule-2",
      scheduledAt: "2026-07-30T09:00:00+09:00",
      operationId: "operation-2",
    }))).rejects.toMatchObject({ code: "SCHEDULE_ALREADY_ACTIVE" });
  });

  it("allows only one winner when concurrent requests target the same content", async () => {
    const { service } = await serviceWithData();
    const results = await Promise.allSettled([
      service.reserve(input()),
      service.reserve(input({
        id: "schedule-2",
        scheduledAt: "2026-07-30T09:00:00+09:00",
        operationId: "operation-2",
      })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "SCHEDULE_ALREADY_ACTIVE" });
  });

  it("increments attempts and enforces registered status transitions", async () => {
    const { service } = await serviceWithData();
    await service.reserve(input());

    const attempting = await service.beginAttempt({ workspaceId: "workspace-1", scheduleId: "schedule-1", now: "2026-07-28T07:01:00.000Z" });
    expect(attempting.attemptCount).toBe(1);

    const verified = await service.transition({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
      status: "scheduled_verified",
      registeredAt: "2026-07-28T07:02:00.000Z",
      verifiedAt: "2026-07-28T07:03:00.000Z",
      now: "2026-07-28T07:03:00.000Z",
    });
    expect(verified.status).toBe("scheduled_verified");

    await expect(service.beginAttempt({ workspaceId: "workspace-1", scheduleId: "schedule-1" }))
      .rejects.toMatchObject({ code: "SCHEDULE_ATTEMPT_NOT_ALLOWED" });
  });

  it("recovers stale registering records as unverified instead of failed", async () => {
    const { service } = await serviceWithData();
    await service.reserve(input());
    await service.beginAttempt({ workspaceId: "workspace-1", scheduleId: "schedule-1", now: "2026-07-28T07:01:00.000Z" });

    const recovered = await service.recoverInterruptedRegistrations({
      workspaceId: "workspace-1",
      staleBefore: "2026-07-28T07:05:00.000Z",
      now: "2026-07-28T07:10:00.000Z",
    });

    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      id: "schedule-1",
      status: "scheduled_unverified",
      failureCode: "SCHEDULE_REGISTRATION_INTERRUPTED",
    });
  });

  it("rejects ownership mismatches before mutating persistence", async () => {
    const { service } = await serviceWithData();

    await expect(service.reserve(input({ projectId: "project-other" }))).rejects.toBeInstanceOf(ScheduledPublicationError);
  });

  it("keeps legacy schedule records readable while adding rich records", async () => {
    const store = new InMemoryPersistenceStore();
    const initial = data();
    await store.set<ScheduleAwareUserData>(COLLECTION, STATE_ID, {
      ...initial,
      scheduledPublishing: [{ contentId: "legacy-content", platform: "tistory", scheduledFor: "2026-07-20T00:00:00.000Z" }],
    });
    const service = new ScheduledPublishingApplicationService(store, () => new Date(NOW));

    const result = await service.reserve(input());

    expect(result.data.scheduledPublishing).toHaveLength(2);
    expect(result.data.scheduledPublishing?.some((record) => isScheduledPublication(record))).toBe(true);
  });
});
