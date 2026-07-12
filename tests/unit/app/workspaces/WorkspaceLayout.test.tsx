import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceLayout } from "../../../../app/workspaces/WorkspaceLayout";
import {
  getWorkspaceViewState,
  projectFixtures,
  workspaceFixtures,
} from "../../../../app/workspaces/workspace-fixtures";

describe("WorkspaceLayout", () => {
  it("keeps Workspace brand information separate from Project information", () => {
    const workspace = workspaceFixtures[0];
    const project = projectFixtures[0];

    expect(workspace).toHaveProperty("audience");
    expect(workspace).not.toHaveProperty("workspaceId");
    expect(workspace).not.toHaveProperty("projects");
    expect(workspace).not.toHaveProperty("contents");
    expect(project.workspaceId).toBe(workspace.id);
  });

  it("renders only Projects belonging to the current Workspace", () => {
    const state = getWorkspaceViewState("bright-studio");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).toContain("Content Operations Foundation");
    expect(html).toContain("Editorial System");
    expect(html).not.toContain("Healthy Habits Series");
    expect(state!.projects.every((project) => project.workspaceId === state!.workspace.id)).toBe(true);
  });

  it("renders a dedicated empty Workspace state without empty Project cards", () => {
    const state = getWorkspaceViewState("new-brand");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).toContain("Empty Workspace");
    expect(html).toContain("Create the first project for New Brand");
    expect(html).not.toContain("Project details");
  });

  it("has no sidebar and includes narrow-screen grid rules", () => {
    const state = getWorkspaceViewState("bright-studio");
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).not.toContain("<aside");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("w-full overflow-x-auto");
  });

  it("uses disabled placeholders instead of links to missing Project routes", () => {
    const state = getWorkspaceViewState("bright-studio");
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).toContain("Project details · Coming soon");
    expect(html).toContain("disabled");
    expect(html).not.toContain("/projects/");
  });
});
