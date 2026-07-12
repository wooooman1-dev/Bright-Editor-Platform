import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeLayout } from "../../../../app/home/HomeLayout";
import type { HomeState } from "../../../../app/home/home-state";

const workspace = { id: "bright-studio", name: "Bright Studio" } as const;
const activeProject = {
  id: "active-project",
  workspaceId: workspace.id,
  name: "Active Project",
  description: "A focused project.",
  status: "in-progress",
  updatedAt: "Today",
  nextAction: "Continue editing",
  progress: 50,
} as const;

function renderHome(state: HomeState): string {
  return renderToStaticMarkup(<HomeLayout state={state} />);
}

describe("HomeLayout", () => {
  it("renders the approved global navigation without a sidebar", () => {
    const html = renderHome({ name: "working", workspaces: [workspace], selectedWorkspaceId: workspace.id, activeProject, recentProjects: [] });

    for (const item of ["Home", "Projects", "Library", "Templates", "Publish", "Analytics", "Settings"]) expect(html).toContain(item);
    expect(html).not.toContain("<aside");
  });

  it("renders Continue Working only when an active project exists", () => {
    const workingHtml = renderHome({ name: "working", workspaces: [workspace], activeProject, recentProjects: [] });
    const inactiveHtml = renderHome({ name: "working", workspaces: [workspace], recentProjects: [] });

    expect(workingHtml).toContain("Continue Working");
    expect(workingHtml).toContain("Active Project");
    expect(inactiveHtml).not.toContain("Continue Working");
  });

  it("keeps First Visit focused without empty project sections", () => {
    const html = renderHome({ name: "first-visit", workspaces: [], recentProjects: [] });

    expect(html).toContain("Create your first workspace");
    expect(html).toContain("No workspace");
    expect(html).not.toContain("Continue Working");
    expect(html).not.toContain("Recent Projects");
    expect(html).not.toContain("Open library");
  });

  it("keeps Empty Workspace focused on its first project", () => {
    const html = renderHome({ name: "empty-workspace", workspaces: [workspace], selectedWorkspaceId: workspace.id, recentProjects: [] });

    expect(html).toContain("Create the first project for this workspace");
    expect(html).not.toContain("Continue Working");
    expect(html).not.toContain("Recent Projects");
    expect(html).not.toContain("Browse templates");
  });

  it.each(["power-user", "publish-complete"] as const)("supports the %s state", (name) => {
    const html = renderHome({ name, workspaces: [workspace], selectedWorkspaceId: workspace.id, activeProject, recentProjects: [activeProject] });

    expect(html).toContain("Continue Working");
    expect(html).toContain("Recent Projects");
    expect(html).toContain("Quick Actions");
  });
});
