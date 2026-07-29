import { describe, expect, it } from "vitest";

import { ScheduledPublishingApplicationService, type ScheduleAwareUserData } from "../../../../../app/application/publishing/ScheduledPublishingApplicationService";
import { InMemoryPersistenceStore } from "../../../../../core/data";

const COLLECTION = "application";
const STATE_ID = "user-data";
const NOW = "2026-07-28T07:00:00.000Z";

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

function reservation(id = "schedule-1") {
  return {
    id,
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    platform: "tistory" as const,
    platformConnectionId: "connection-1",
    revisionId: "revision-1",
    scheduledAt: "2026-07-29T09:00:00+09:00",
    timezone: "Asia/Seoul",
    categoryId: null,
    categoryName: null,
    operationId: `operation-${id}`,
    now: NOW,
  };
}

async function setup() {
  const store = new InMemoryPersistenceStore();
  await store.set(COLLECTION, STATE_ID, data());
  return new ScheduledPublishingApplicationService(store, () => new Date(NOW));
}

describe("ScheduledPublishingApplicationService safety", () => {
  it("does not mark a schedule verified without registration and verification timestamps", async () => {
    const service = await setup();
    await service.reserve(reservation());

    await expect(service.transition({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
      status: "scheduled_verified",
    })).rejects.toMatchObject({ code: "SCHEDULE_VERIFICATION_EVIDENCE_REQUIRED" });
  });

  it("clears prior uncertainty after a later external verification succeeds", async () => {
    const service = await setup();
    await service.reserve(reservation());
    await service.transition({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
      status: "scheduled_unverified",
      failureCode: "TISTORY_SCHEDULE_ACK_UNCONFIRMED",
      lastError: "외부 예약 상태를 확인하지 못했습니다.",
      now: "2026-07-28T07:02:00.000Z",
    });

    const verified = await service.transition({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
      status: "scheduled_verified",
      registeredAt: "2026-07-28T07:01:00.000Z",
      verifiedAt: "2026-07-28T07:03:00.000Z",
      now: "2026-07-28T07:03:00.000Z",
    });

    expect(verified.failureCode).toBeUndefined();
    expect(verified.lastError).toBeUndefined();
  });

  it("allows a new idempotency record after the prior identical reservation was cancelled", async () => {
    const service = await setup();
    await service.reserve(reservation());
    await service.transition({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
      status: "scheduled_verified",
      registeredAt: "2026-07-28T07:01:00.000Z",
      verifiedAt: "2026-07-28T07:02:00.000Z",
      now: "2026-07-28T07:02:00.000Z",
    });
    await service.transition({
      workspaceId: "workspace-1",
      scheduleId: "schedule-1",
      status: "cancelled",
      now: "2026-07-28T07:03:00.000Z",
    });

    const next = await service.reserve(reservation("schedule-2"));

    expect(next.created).toBe(true);
    expect(next.reservation.id).toBe("schedule-2");
    expect(next.data.scheduledPublishing).toHaveLength(2);
  });
});
