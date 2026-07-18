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
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  lastVerifiedAt: "2026-07-18T00:00:00.000Z",
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
  workflow: "media.upload",
  finalConfirmation: true,
} as const;

describe("Tistory media upload permission", () => {
  it("keeps media upload outside safe default permissions", () => {
    expect(safeDraftPermissions).not.toContain("media.upload");
  });

  it("blocks media upload until the account explicitly grants it", () => {
    expect(() => new PublishingPermissionGate().authorize(request, connection)).toThrowError(PublishingPermissionError);
    expect(() => new PublishingPermissionGate().authorize(request, connection)).toThrow(/does not allow media\.upload/i);
  });

  it("allows only the registered media workflow after explicit grant", () => {
    const permitted: PlatformConnection = {
      ...connection,
      automationPermissions: [...safeDraftPermissions, "media.upload"],
    };
    expect(new PublishingPermissionGate().authorize(request, permitted)).toBe("media.upload");
  });
});
