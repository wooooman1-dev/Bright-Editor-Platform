import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  contentSchedulePresentation,
  contentSchedules,
  partitionContentSchedules,
} from "../../../../app/user-flow/content-schedule-ui";
import {
  isRemovableScheduledPublication,
  type ScheduledPublication,
  type ScheduledPublishingRecord,
} from "../../../../core/publishing";

const editorSource = readFileSync(join(process.cwd(), "app/user-flow/EditorWorkspaceImplementation.tsx"), "utf8");
const componentSource = readFileSync(join(process.cwd(), "app/user-flow/ContentScheduleStatus.tsx"), "utf8");

function schedule(overrides: Partial<ScheduledPublication> = {}): ScheduledPublication {
  return Object.freeze({
    id: "schedule-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    platform: "wordpress",
    platformConnectionId: "connection-1",
    revisionId: "rev-1",
    scheduledAt: "2026-09-01T18:00:00+09:00",
    timezone: "Asia/Seoul",
    status: "scheduled_verified",
    categoryId: "2",
    categoryName: "생활재테크",
    requestFingerprint: "fingerprint",
    operationId: "operation-1",
    attemptCount: 1,
    lastAttemptAt: "2026-08-10T13:00:00.000Z",
    createdAt: "2026-08-10T13:00:00.000Z",
    updatedAt: "2026-08-10T13:00:10.000Z",
    ...overrides,
  }) as ScheduledPublication;
}

describe("content schedule status", () => {
  it("selects only the current content's schedules, newest first", () => {
    const records: readonly ScheduledPublishingRecord[] = [
      schedule({ id: "older", createdAt: "2026-08-01T00:00:00.000Z" }),
      schedule({ id: "other-content", contentId: "content-2" }),
      schedule({ id: "newer", createdAt: "2026-08-09T00:00:00.000Z" }),
    ];

    expect(contentSchedules(records, "content-1").map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("ignores legacy records that predate the schedule contract", () => {
    const records = [
      { contentId: "content-1", platform: "tistory", scheduledFor: "2026-09-01T18:00:00+09:00" },
    ] as unknown as readonly ScheduledPublishingRecord[];

    expect(contentSchedules(records, "content-1")).toEqual([]);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(contentSchedules(undefined, "content-1")).toEqual([]);
  });

  it("renders the scheduled instant in the timezone the schedule was registered with", () => {
    // Asserted without pinning locale wording: day period and date order depend
    // on the host ICU data, while the timezone the instant is rendered in does
    // not.
    const instant = "2026-09-01T18:00:00+09:00";
    const seoul = contentSchedulePresentation(schedule({ scheduledAt: instant, timezone: "Asia/Seoul" }));
    const newYork = contentSchedulePresentation(schedule({ scheduledAt: instant, timezone: "America/New_York" }));

    expect(seoul.scheduledLabel).toContain("Asia/Seoul");
    expect(newYork.scheduledLabel).toContain("America/New_York");
    expect(seoul.scheduledLabel).toMatch(/2026/);
    expect(seoul.scheduledLabel).not.toBe(newYork.scheduledLabel);
  });

  it("falls back to the raw values when the instant cannot be parsed", () => {
    const view = contentSchedulePresentation(schedule({ scheduledAt: "not-a-datetime" }));

    expect(view.scheduledLabel).toBe("not-a-datetime · Asia/Seoul");
  });

  it("falls back to the raw values when the timezone is not supported", () => {
    const view = contentSchedulePresentation(schedule({ timezone: "Mars/Olympus" }));

    expect(view.scheduledLabel).toBe("2026-09-01T18:00:00+09:00 · Mars/Olympus");
  });

  it("distinguishes draft scheduling from public scheduling", () => {
    expect(contentSchedulePresentation(schedule({ postStatus: "draft" })).postStatusLabel).toBe("초안 예약");
    expect(contentSchedulePresentation(schedule({ postStatus: "future" })).postStatusLabel).toBe("공개 예약");
  });

  it("reads a record without postStatus as draft scheduling", () => {
    const record = schedule();
    expect(record.postStatus).toBeUndefined();
    expect(contentSchedulePresentation(record).postStatusLabel).toBe("초안 예약");
  });

  it.each([
    ["scheduled_verified" as const, "예약 확인됨", "success" as const, true],
    ["scheduled_unverified" as const, "외부 확인 필요", "warning" as const, true],
    ["registering" as const, "등록 중", "neutral" as const, true],
    ["failed" as const, "실패", "danger" as const, false],
    ["cancelled" as const, "취소됨", "neutral" as const, false],
    ["published" as const, "발행됨", "success" as const, false],
  ])("presents %s as %s", (status, label, tone, active) => {
    const view = contentSchedulePresentation(schedule({ status }));

    expect(view.statusLabel).toBe(label);
    expect(view.statusTone).toBe(tone);
    expect(view.active).toBe(active);
  });

  it("shows the failure reason only for states the user must act on", () => {
    const failure = { failureCode: "DRAFT_CREATE_FAILED", lastError: "예약 등록에 실패했습니다." };

    expect(contentSchedulePresentation(schedule({ status: "failed", ...failure })).failureReason)
      .toBe("예약 등록에 실패했습니다.");
    expect(contentSchedulePresentation(schedule({ status: "scheduled_unverified", ...failure })).failureReason)
      .toBe("예약 등록에 실패했습니다.");
    expect(contentSchedulePresentation(schedule({ status: "cancelled", ...failure })).failureReason)
      .toBeUndefined();
  });

  it("prefers the public URL over the management URL when both exist", () => {
    const view = contentSchedulePresentation(schedule({
      externalManagementUrl: "https://example.com/wp-admin/post.php?post=5&action=edit",
      publicUrl: "https://example.com/post",
    }));

    expect(view.externalUrl).toBe("https://example.com/post");
  });

  it("mounts one read-only schedule view in the editor without a cancel action", () => {
    expect(editorSource.match(/<ContentScheduleStatus\b/g)).toHaveLength(1);
    expect(componentSource).not.toMatch(/취소하기|onCancel|schedules\/cancel/);
  });

  it("separates active schedules from finished history", () => {
    const schedules = [
      schedule({ id: "verified", status: "scheduled_verified" }),
      schedule({ id: "unverified", status: "scheduled_unverified" }),
      schedule({ id: "registering", status: "registering" }),
      schedule({ id: "failed", status: "failed" }),
      schedule({ id: "cancelled", status: "cancelled" }),
      schedule({ id: "published", status: "published" }),
    ];

    const { active, finished } = partitionContentSchedules(schedules);

    expect(active.map((item) => item.id)).toEqual(["verified", "unverified", "registering"]);
    expect(finished.map((item) => item.id)).toEqual(["failed", "cancelled", "published"]);
  });

  it("never treats an unconfirmed registration as removable history", () => {
    expect(isRemovableScheduledPublication(schedule({ status: "scheduled_unverified" }))).toBe(false);
    expect(isRemovableScheduledPublication(schedule({ status: "registering" }))).toBe(false);
    expect(isRemovableScheduledPublication(schedule({ status: "scheduled_verified" }))).toBe(false);
    expect(isRemovableScheduledPublication(schedule({ status: "failed" }))).toBe(true);
    expect(isRemovableScheduledPublication(schedule({ status: "cancelled" }))).toBe(true);
    expect(isRemovableScheduledPublication(schedule({ status: "published" }))).toBe(true);
  });

  it("adopts the stored snapshot after clearing so autosave cannot restore the history", () => {
    expect(componentSource).toMatch(/result\.data[\s\S]*onCleared/);
    expect(editorSource).toMatch(/<ContentScheduleStatus[^>]*onCleared=\{onPersist\}/);
  });
});
