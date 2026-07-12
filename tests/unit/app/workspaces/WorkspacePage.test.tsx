import { describe, expect, it } from "vitest";

import WorkspacePage from "../../../../app/workspaces/[workspaceId]/page";

describe("WorkspacePage", () => {
  it("returns the Workspace layout for a known workspaceId", async () => {
    const page = await WorkspacePage({ params: Promise.resolve({ workspaceId: "bright-studio" }) });

    expect(page.type).toBeDefined();
    expect(page.props.state.workspace.id).toBe("bright-studio");
  });

  it("uses not-found handling for an unknown workspaceId", async () => {
    await expect(WorkspacePage({ params: Promise.resolve({ workspaceId: "missing-workspace" }) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
