import { describe, expect, it } from "vitest";

import {
  ScheduledPublicationError,
  assertScheduledPublicationTransition,
  assertValidScheduleTime,
  createScheduleRequestFingerprint,
  hasActiveScheduledPublication,
  scheduledPublicationStorageKey,
  type ScheduledPublication,
} from "../../../../core/publishing";

const schedule: ScheduledPublication = Object.freeze({
  id: "schedule-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  platform: "tistory",
  platformConnectionId: "connection-1",
  revisionId: "revision-1",
  scheduledAt: "2026-08-03T00:00:00.000Z",
  timezone: "Asia/Seoul",
  status: "scheduled_verified",
  categoryId: "123",
  categoryName: "건강정보",
  requestFingerprint: "fingerprint-1",
  operationId: "operation-1",
  attemptCount: 1,
  lastAttemptAt: "2026-07-28T00:00:00.000Z",
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
});

describe("ScheduledPublication", () => {
  it("accepts a future absolute ISO datetime and IANA timezone", () => {
    const result = assertValidScheduleTime(
      { scheduledAt: "2026-08-03T00:00:00.000Z", timezone: "Asia/Seoul" },
      new Date("2026-07-28T00:00:00.000Z"),
    );
    expect(result.instant.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(result.timezone).toBe("Asia/Seoul");
  });

  it("rejects a schedule without an absolute timezone suffix", () => {
    expect(() => assertValidScheduleTime(
      { scheduledAt: "2026-08-03T09:00:00", timezone: "Asia/Seoul" },
      new Date("2026-07-28T00:00:00.000Z"),
    )).toThrowError(ScheduledPublicationError);
  });

  it("rejects an invalid IANA timezone", () => {
    expect(() => assertValidScheduleTime(
      { scheduledAt: "2026-08-03T00:00:00.000Z", timezone: "Seoul" },
      new Date("2026-07-28T00:00:00.000Z"),
    )).toThrow(/IANA timezone/i);
  });

  it("rejects a non-future schedule", () => {
    expect(() => assertValidScheduleTime(
      { scheduledAt: "2026-07-28T00:00:00.000Z", timezone: "Asia/Seoul" },
      new Date("2026-07-28T00:00:00.000Z"),
    )).toThrow(/미래/);
  });

  it("creates the same fingerprint for the same normalized identity", () => {
    const identity = {
      workspaceId: "workspace-1",
      contentId: "content-1",
      platform: "tistory",
      platformConnectionId: "connection-1",
      revisionId: "revision-1",
      scheduledAt: "2026-08-03T00:00:00.000Z",
      timezone: "Asia/Seoul",
    } as const;
    expect(createScheduleRequestFingerprint(identity)).toBe(createScheduleRequestFingerprint(identity));
    expect(createScheduleRequestFingerprint({ ...identity, revisionId: "revision-2" })).not.toBe(createScheduleRequestFingerprint(identity));
  });

  it("detects only active schedules for the same content and platform", () => {
    expect(hasActiveScheduledPublication([schedule], { contentId: "content-1", platform: "tistory" })).toBe(true);
    expect(hasActiveScheduledPublication([{ ...schedule, status: "failed" }], { contentId: "content-1", platform: "tistory" })).toBe(false);
    expect(hasActiveScheduledPublication([schedule], { contentId: "content-2", platform: "tistory" })).toBe(false);
  });

  it("uses stable storage keys for new and legacy records", () => {
    expect(scheduledPublicationStorageKey(schedule)).toBe("schedule-1");
    expect(scheduledPublicationStorageKey({ contentId: "content-1", platform: "tistory", scheduledFor: "2026-08-03T00:00:00.000Z" }))
      .toBe("legacy:content-1:tistory:2026-08-03T00:00:00.000Z");
  });

  it("allows verified and unverified registration outcomes but blocks terminal changes", () => {
    expect(() => assertScheduledPublicationTransition("registering", "scheduled_verified")).not.toThrow();
    expect(() => assertScheduledPublicationTransition("registering", "scheduled_unverified")).not.toThrow();
    expect(() => assertScheduledPublicationTransition("published", "registering")).toThrow(/변경할 수 없습니다/);
  });
});
