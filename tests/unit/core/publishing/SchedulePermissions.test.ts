import { describe, expect, it } from "vitest";

import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";
import { PublishingPermissionError, PublishingPermissionGate } from "../../../../core/publishing";

const connection: PlatformConnection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-health",
  status: "connected",
  publicMetadata: { sessionStateAvailable: true },
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  lastVerifiedAt: "2026-07-28T00:00:00.000Z",
  selectedAsDefault: true,
  version: 1,
  automationPermissions: safeDraftPermissions,
  publishingPolicy: "review_first",
};

const request = {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  platformConnectionId: "connection-1",
  workflow: "schedule.create",
  finalConfirmation: true,
} as const;

describe("scheduled publishing permissions", () => {
  it("keeps scheduling outside safe Draft permissions", () => {
    expect(safeDraftPermissions).not.toContain("schedule.create");
    expect(safeDraftPermissions).not.toContain("schedule.update");
    expect(safeDraftPermissions).not.toContain("schedule.cancel");
    expect(safeDraftPermissions).not.toContain("publish.execute");
  });

  it("blocks schedule creation until the account explicitly grants it", () => {
    expect(() => new PublishingPermissionGate().authorize(request, connection)).toThrowError(PublishingPermissionError);
    expect(() => new PublishingPermissionGate().authorize(request, connection)).toThrow(/does not allow schedule\.create/i);
  });

  it("requires final confirmation for schedule creation", () => {
    const permitted: PlatformConnection = {
      ...connection,
      automationPermissions: [...safeDraftPermissions, "schedule.create"],
    };
    expect(() => new PublishingPermissionGate().authorize({ ...request, finalConfirmation: false }, permitted)).toThrow(/Final user confirmation/i);
  });

  it("maps read-only schedule verification to schedule.create without another confirmation", () => {
    const permitted: PlatformConnection = {
      ...connection,
      automationPermissions: [...safeDraftPermissions, "schedule.create"],
    };
    expect(new PublishingPermissionGate().authorize({ ...request, workflow: "schedule.verify", finalConfirmation: false }, permitted))
      .toBe("schedule.create");
  });

  it("does not grant immediate public publishing with scheduling", () => {
    const permitted: PlatformConnection = {
      ...connection,
      automationPermissions: [...safeDraftPermissions, "schedule.create"],
    };
    expect(permitted.automationPermissions).not.toContain("publish.execute");
    expect(() => new PublishingPermissionGate().authorize({ ...request, workflow: "publish.execute" }, permitted))
      .toThrow(/not registered/i);
  });
});
