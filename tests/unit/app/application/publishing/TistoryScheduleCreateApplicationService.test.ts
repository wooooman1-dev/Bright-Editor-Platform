import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlatformConnection } from "../../../../../core/connections";
import {
  TistoryScheduleCreateApplicationService,
  type TistoryScheduleCreateAuditRecord,
  type TistoryScheduleCreateResult,
} from "../../../../../app/application/publishing/TistoryScheduleCreateApplicationService";

const roots: string[] = [];

const NOW = "2026-07-28T14:00:00.000Z";
const SCHEDULED_AT = "2026-07-29T09:00:00+09:00";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function connection(overrides: Partial<PlatformConnection> = {}): PlatformConnection {
  return {
    id: "connection-1",
    workspaceId: "workspace-1",
    platform: "tistory",
    displayName: "bright-healthy",
    status: "connected",
    publicMetadata: { blogId: "bright-healthy", sessionStateAvailable: true },
    createdAt: NOW,
    updatedAt: NOW,
    lastVerifiedAt: NOW,
    selectedAsDefault: true,
    version: 1,
    automationPermissions: ["connection.verify", "schedule.create"],
    publishingPolicy: "review_first",
    ...overrides,
  };
}

function execution(account = connection(), selectedTarget = true) {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    connection: account,
    selectedTarget,
    revisionId: "revision-1",
    title: "예약 테스트 글",
    html: "<p>예약 테스트 본문입니다.</p>",
    tags: ["예약", "테스트"],
    categoryId: "100",
    categoryName: "건강정보",
    scheduledAt: SCHEDULED_AT,
    timezone: "Asia/Seoul" as const,
    finalConfirmation: true as const,
  };
}

function verified(): TistoryScheduleCreateResult {
  return {
    status: "scheduled_verified",
    workflow: "schedule.create",
    finalClickIssued: true,
    registeredAt: NOW,
    verifiedAt: "2026-07-28T14:01:00.000Z",
    externalPostId: "12345",
    externalManagementUrl: "https://bright-healthy.tistory.com/manage/posts/",
  };
}

describe("TistoryScheduleCreateApplicationService", () => {
  it("runs the dedicated schedule worker, writes a bounded command, and removes it", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-tistory-schedule-create-"));
    roots.push(root);
    const records: TistoryScheduleCreateAuditRecord[] = [];
    let commandPath = "";
    const worker = vi.fn(async (path: string) => {
      commandPath = path;
      const command = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      expect(command).toMatchObject({
        blogId: "bright-healthy",
        revisionId: "revision-1",
        title: "예약 테스트 글",
        scheduledAt: SCHEDULED_AT,
        timezone: "Asia/Seoul",
        categoryId: "100",
      });
      expect(String(command.storageStatePath)).toContain("storage-state.json");
      return verified();
    });
    const service = new TistoryScheduleCreateApplicationService(
      { save: async (record) => { records.push(record); } },
      root,
      () => new Date(NOW),
      worker,
    );

    const result = await service.execute(execution());

    expect(result).toEqual(verified());
    expect(worker).toHaveBeenCalledTimes(1);
    await expect(readFile(commandPath, "utf8")).rejects.toThrow();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      workflow: "schedule.create",
      requiredPermission: "schedule.create",
      confirmationState: "confirmed",
      revisionId: "revision-1",
      scheduledAt: SCHEDULED_AT,
      result: "scheduled_verified",
      finalClickIssued: true,
    });
  });

  it("does not start Playwright without explicit schedule.create permission", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-tistory-schedule-create-"));
    roots.push(root);
    const worker = vi.fn(async () => verified());
    const service = new TistoryScheduleCreateApplicationService(
      { save: async () => undefined },
      root,
      () => new Date(NOW),
      worker,
    );

    const result = await service.execute(execution(connection({ automationPermissions: ["connection.verify"] })));

    expect(result).toMatchObject({
      status: "failed",
      finalClickIssued: false,
      diagnosticCode: "PERMISSION_DENIED",
    });
    expect(worker).not.toHaveBeenCalled();
  });

  it("preserves an invalid worker outcome as scheduled_unverified and never treats it as a safe retry", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-tistory-schedule-create-"));
    roots.push(root);
    const records: TistoryScheduleCreateAuditRecord[] = [];
    const worker = vi.fn(async () => {
      throw Object.assign(new Error("invalid worker output"), { code: "WORKER_RESULT_INVALID" });
    });
    const service = new TistoryScheduleCreateApplicationService(
      { save: async (record) => { records.push(record); } },
      root,
      () => new Date(NOW),
      worker,
    );

    const result = await service.execute(execution());

    expect(result).toMatchObject({
      status: "scheduled_unverified",
      workflow: "schedule.create",
      finalClickIssued: true,
      registeredAt: NOW,
      diagnosticCode: "WORKER_RESULT_INVALID",
    });
    expect(records[0]).toMatchObject({
      result: "scheduled_unverified",
      finalClickIssued: true,
      safeErrorCode: "WORKER_RESULT_INVALID",
    });
  });

  it("does not start the worker for an unselected publishing target", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-tistory-schedule-create-"));
    roots.push(root);
    const worker = vi.fn(async () => verified());
    const service = new TistoryScheduleCreateApplicationService(
      { save: async () => undefined },
      root,
      () => new Date(NOW),
      worker,
    );

    const result = await service.execute(execution(connection(), false));

    expect(result).toMatchObject({ status: "failed", diagnosticCode: "TARGET_NOT_SELECTED" });
    expect(worker).not.toHaveBeenCalled();
  });
});
