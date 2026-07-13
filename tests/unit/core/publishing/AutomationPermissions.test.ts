import { describe, expect, it } from "vitest";

import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";
import { PublishingPermissionGate } from "../../../../core/publishing";

const connection: PlatformConnection = { id: "account-1", workspaceId: "workspace-1", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: {}, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1, automationPermissions: safeDraftPermissions, publishingPolicy: "review_first" };
const request = { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", platformConnectionId: "account-1", workflow: "draft.create", finalConfirmation: true };

describe("server publishing permission gate", () => {
  it("allows only the registered confirmed draft workflow", () => expect(new PublishingPermissionGate().authorize(request, connection)).toBe("draft.create"));
  it("denies public publish and arbitrary workflows", () => {
    expect(() => new PublishingPermissionGate().authorize({ ...request, workflow: "publish.execute" }, connection)).toThrow("not registered");
    expect(() => new PublishingPermissionGate().authorize({ ...request, workflow: "javascript.execute" }, connection)).toThrow("not registered");
  });
  it("enforces Workspace ownership and final confirmation", () => {
    expect(() => new PublishingPermissionGate().authorize({ ...request, workspaceId: "workspace-2" }, connection)).toThrow("does not belong");
    expect(() => new PublishingPermissionGate().authorize({ ...request, finalConfirmation: false }, connection)).toThrow("confirmation");
  });
});
