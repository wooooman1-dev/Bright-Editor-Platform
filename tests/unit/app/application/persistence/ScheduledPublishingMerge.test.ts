import { describe, expect, it } from "vitest";

import { mergeServerMutationSnapshot } from "../../../../../app/application/persistence/mergeUserDataSnapshot";
import type { UserData } from "../../../../../app/user-flow/user-data";
import type { ScheduledPublication } from "../../../../../core/publishing";

const baseData: UserData = {
  workspace: { id: "workspace-1", name: "Studio" },
  brands: [],
  projects: [],
  contents: [],
  scheduledPublishing: [],
};

function schedule(id: string, status: ScheduledPublication["status"], updatedAt: string): ScheduledPublication {
  return {
    id,
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    platform: "tistory",
    platformConnectionId: "connection-1",
    revisionId: "revision-1",
    scheduledAt: "2026-07-29T09:00:00+09:00",
    timezone: "Asia/Seoul",
    status,
    categoryId: null,
    categoryName: null,
    requestFingerprint: `fingerprint-${id}`,
    operationId: `operation-${id}`,
    attemptCount: 1,
    lastAttemptAt: updatedAt,
    createdAt: "2026-07-28T07:00:00.000Z",
    updatedAt,
  };
}

function withSchedules(records: readonly ScheduledPublication[]): UserData {
  return {
    ...baseData,
    scheduledPublishing: records,
  } as unknown as UserData;
}

describe("scheduled publishing persistence merge", () => {
  it("keeps concurrent historical records instead of collapsing by content and platform", () => {
    const first = schedule("schedule-1", "registering", "2026-07-28T07:00:00.000Z");
    const concurrent = schedule("schedule-2", "cancelled", "2026-07-28T07:02:00.000Z");
    const verified = { ...first, status: "scheduled_verified" as const, updatedAt: "2026-07-28T07:03:00.000Z" };

    const merged = mergeServerMutationSnapshot(
      withSchedules([first, concurrent]),
      withSchedules([first]),
      withSchedules([verified]),
    );
    const records = merged.scheduledPublishing as unknown as readonly ScheduledPublication[];

    expect(records).toHaveLength(2);
    expect(records.find((record) => record.id === "schedule-1")?.status).toBe("scheduled_verified");
    expect(records.find((record) => record.id === "schedule-2")?.status).toBe("cancelled");
  });

  it("preserves distinct legacy records by scheduled timestamp", () => {
    const legacyA = { contentId: "content-1", platform: "tistory", scheduledFor: "2026-07-29T00:00:00.000Z" };
    const legacyB = { contentId: "content-1", platform: "tistory", scheduledFor: "2026-07-30T00:00:00.000Z" };
    const current = { ...baseData, scheduledPublishing: [legacyA, legacyB] };
    const base = { ...baseData, scheduledPublishing: [legacyA] };
    const next = { ...baseData, scheduledPublishing: [legacyA] };

    const merged = mergeServerMutationSnapshot(current, base, next);

    expect(merged.scheduledPublishing).toEqual([legacyA, legacyB]);
  });
});
