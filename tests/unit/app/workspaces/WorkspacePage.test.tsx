import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/application/studio-store", () => ({ studioStore: { get: vi.fn(async () => ({ workspace: { id: "bright-studio", name: "Bright Studio" }, brands: [], projects: [], contents: [] })) } }));

import WorkspacePage from "../../../../app/workspaces/[workspaceId]/page";
import { FirstRunExperience } from "../../../../app/user-flow/FirstRunExperience";

describe("WorkspacePage", () => {
  it("returns the Workspace layout for a known workspaceId", async () => {
    const page = await WorkspacePage({ params: Promise.resolve({ workspaceId: "bright-studio" }) });

    expect(page.type).toBe(FirstRunExperience);
  });

  it("uses not-found handling for an unknown workspaceId", async () => {
    await expect(WorkspacePage({ params: Promise.resolve({ workspaceId: "missing-workspace" }) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
