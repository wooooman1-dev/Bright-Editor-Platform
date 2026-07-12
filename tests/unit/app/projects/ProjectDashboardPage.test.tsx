import { describe, expect, it } from "vitest";

import ProjectDashboardPage from "../../../../app/workspaces/[workspaceId]/projects/[projectId]/page";

function renderPage(workspaceId: string, projectId: string) {
  return ProjectDashboardPage({ params: Promise.resolve({ workspaceId, projectId }) });
}

describe("ProjectDashboardPage", () => {
  it("renders a valid Workspace and Project combination", async () => {
    const page = await renderPage("bright-studio", "content-operations");

    expect(page.type).toBeDefined();
    expect(page.props.state.workspace.id).toBe("bright-studio");
    expect(page.props.state.project.id).toBe("content-operations");
    expect(page.props.state.project.workspaceId).toBe(page.props.state.workspace.id);
  });

  it("uses not-found handling for an unknown Workspace", async () => {
    await expect(renderPage("missing-workspace", "content-operations")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("uses not-found handling for an unknown Project", async () => {
    await expect(renderPage("bright-studio", "missing-project")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("uses not-found handling when the Project belongs to another Workspace", async () => {
    await expect(renderPage("bright-health", "content-operations")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
