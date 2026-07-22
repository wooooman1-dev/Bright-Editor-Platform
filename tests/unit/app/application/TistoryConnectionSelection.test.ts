import { describe, expect, it } from "vitest";

import { isConnectionSelectedForContent, resolveTistoryConnectionId } from "../../../../app/application/publishing/TistoryConnectionSelection";
import type { UserData } from "../../../../app/user-flow/user-data";

function data(overrides: Partial<UserData> = {}): UserData {
  return {
    workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
    brands: [],
    projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", selectedPublishingAccountIds: ["connection-project"], createdAt: "now", updatedAt: "now" }],
    contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: "Draft", body: "", status: "draft", createdAt: "now", updatedAt: "now" }],
    ...overrides,
  };
}

describe("TistoryConnectionSelection", () => {
  it("uses the single Project connection when Content has no copied connection reference", () => {
    const current = data();
    expect(resolveTistoryConnectionId(current, current.contents[0])).toBe("connection-project");
    expect(isConnectionSelectedForContent(current, current.contents[0], "connection-project")).toBe(true);
  });

  it("prefers the explicit Content connection over Project defaults", () => {
    const current = data({
      contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: "Draft", body: "", status: "draft", publishingAccountId: "connection-content", selectedPublishingAccountIds: ["connection-content"], createdAt: "now", updatedAt: "now" }],
    });
    expect(resolveTistoryConnectionId(current, current.contents[0])).toBe("connection-content");
  });

  it("does not guess when multiple Project connections exist without a default", () => {
    const current = data({
      projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", selectedPublishingAccountIds: ["connection-a", "connection-b"], createdAt: "now", updatedAt: "now" }],
    });
    expect(resolveTistoryConnectionId(current, current.contents[0])).toBeUndefined();
  });
});
