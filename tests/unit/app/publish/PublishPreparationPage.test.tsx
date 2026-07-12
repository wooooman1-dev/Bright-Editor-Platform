import { describe, expect, it } from "vitest";

import PublishPreparationPage from "../../../../app/workspaces/[workspaceId]/projects/[projectId]/contents/[contentId]/publish/page";

function renderPage(workspaceId: string, projectId: string, contentId: string) {
  return PublishPreparationPage({ params: Promise.resolve({ workspaceId, projectId, contentId }) });
}

describe("PublishPreparationPage", () => {
  it("renders a valid Workspace, Project, and Content combination", async () => {
    const page = await renderPage("bright-studio", "content-operations", "content-workflow-map");

    expect(page.props.state.workspace.id).toBe("bright-studio");
    expect(page.props.state.project.id).toBe("content-operations");
    expect(page.props.state.project.workspaceId).toBe(page.props.state.workspace.id);
    expect(page.props.state.content.id).toBe("content-workflow-map");
    expect(page.props.state.content.projectId).toBe(page.props.state.project.id);
  });

  it("uses not-found handling for an unknown Workspace", async () => {
    await expect(renderPage("missing-workspace", "content-operations", "content-workflow-map")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("uses not-found handling for an unknown Project", async () => {
    await expect(renderPage("bright-studio", "missing-project", "content-workflow-map")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("uses not-found handling when the Project belongs to another Workspace", async () => {
    await expect(renderPage("bright-health", "content-operations", "content-workflow-map")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("uses not-found handling for an unknown Content", async () => {
    await expect(renderPage("bright-studio", "content-operations", "missing-content")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("uses not-found handling when Content belongs to another Project", async () => {
    await expect(renderPage("bright-studio", "editorial-system", "content-workflow-map")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
