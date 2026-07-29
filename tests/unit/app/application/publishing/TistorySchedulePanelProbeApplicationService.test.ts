import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlatformConnection } from "../../../../../core/connections";
import {
  TistorySchedulePanelProbeApplicationService,
  type TistorySchedulePanelProbeAuditRecord,
  type TistorySchedulePanelProbeResult,
} from "../../../../../app/application/publishing/TistorySchedulePanelProbeApplicationService";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function connection(
  overrides: Partial<PlatformConnection> = {},
): PlatformConnection {
  return {
    id: "connection-1",
    workspaceId: "workspace-1",
    platform: "tistory",
    displayName: "bright-healthy",
    status: "connected",
    publicMetadata: {
      blogId: "bright-healthy",
      sessionStateAvailable: true,
    },
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
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
  } as const;
}

function diagnosed(): TistorySchedulePanelProbeResult {
  return {
    status: "diagnosed",
    workflow: "schedule.verify",
    probeStage: "publication-panel",
    readOnly: true,
    observedAt: "2026-07-28T10:00:00.000Z",
    clickCounts: {
      total: 1,
      allowedOpen: 1,
      restricted: 0,
      targets: [{ id: "publish-layer-btn", tag: "button" }],
    },
    inventory: {
      characterSet: "UTF-8",
      controlCount: 8,
      newlyVisibleControlCount: 8,
    },
  };
}

describe("TistorySchedulePanelProbeApplicationService", () => {
  it("runs the bounded panel probe and removes its command file", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-schedule-panel-probe-"));
    roots.push(root);
    const records: TistorySchedulePanelProbeAuditRecord[] = [];
    let commandPath = "";
    const worker = vi.fn(async (path: string) => {
      commandPath = path;
      const command = JSON.parse(
        await readFile(path, "utf8"),
      ) as Record<string, unknown>;
      expect(command.blogId).toBe("bright-healthy");
      expect(String(command.storageStatePath)).toContain("connections");
      return diagnosed();
    });
    const service = new TistorySchedulePanelProbeApplicationService(
      { save: async (record) => { records.push(record); } },
      root,
      () => new Date("2026-07-28T10:00:00.000Z"),
      worker,
    );

    const result = await service.execute(execution());

    expect(result).toEqual(diagnosed());
    expect(worker).toHaveBeenCalledTimes(1);
    await expect(readFile(commandPath, "utf8")).rejects.toThrow();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      workflow: "schedule.verify",
      probeStage: "publication-panel",
      requiredPermission: "schedule.create",
      confirmationState: "not_required",
      result: "diagnosed",
    });
  });

  it("does not start Playwright when schedule.create permission is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-schedule-panel-probe-"));
    roots.push(root);
    const records: TistorySchedulePanelProbeAuditRecord[] = [];
    const worker = vi.fn(async () => diagnosed());
    const account = connection({
      automationPermissions: ["connection.verify"],
    });
    const service = new TistorySchedulePanelProbeApplicationService(
      { save: async (record) => { records.push(record); } },
      root,
      () => new Date("2026-07-28T10:00:00.000Z"),
      worker,
    );

    const result = await service.execute(execution(account));

    expect(result).toMatchObject({
      status: "failed",
      diagnosticCode: "PERMISSION_DENIED",
      probeStage: "publication-panel",
      readOnly: true,
    });
    expect(worker).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({
      result: "failed",
      safeErrorCode: "PERMISSION_DENIED",
    });
  });

  it("does not start Playwright for an unselected Project publishing target", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-schedule-panel-probe-"));
    roots.push(root);
    const worker = vi.fn(async () => diagnosed());
    const service = new TistorySchedulePanelProbeApplicationService(
      { save: async () => undefined },
      root,
      () => new Date("2026-07-28T10:00:00.000Z"),
      worker,
    );

    const result = await service.execute(execution(connection(), false));

    expect(result).toMatchObject({
      status: "failed",
      diagnosticCode: "TARGET_NOT_SELECTED",
      probeStage: "publication-panel",
    });
    expect(worker).not.toHaveBeenCalled();
  });
});
