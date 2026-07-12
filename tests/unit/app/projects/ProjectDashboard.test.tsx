import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectDashboard } from "../../../../app/projects/ProjectDashboard";
import {
  contentSummaryFixtures,
  getProjectDashboardState,
} from "../../../../app/projects/project-dashboard-fixtures";

describe("ProjectDashboard", () => {
  it("renders the selected Workspace and Project context", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(html).toContain("Content Operations Foundation");
    expect(html).toContain("Back to Bright Studio");
    expect(html).toContain('href="/workspaces/bright-studio"');
    expect(html).toContain("Build the first repeatable content workflow.");
    expect(html).toContain("June 18, 2026");
  });

  it("includes only Content owned by the current Project", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(state!.contents.length).toBe(3);
    expect(state!.contents.every((content) => content.projectId === state!.project.id)).toBe(true);
    expect(html).toContain("A practical content workflow map");
    expect(html).not.toContain("Editorial principles that scale");
    expect(contentSummaryFixtures.some((content) => content.projectId === "editorial-system")).toBe(true);
  });

  it("renders a dedicated empty Content state for an existing Project", () => {
    const state = getProjectDashboardState("bright-studio", "launch-series");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(state!.contents).toHaveLength(0);
    expect(html).toContain("No content yet");
    expect(html).toContain("This project is ready for its first content");
    expect(html).toContain("Launch Series");
  });

  it("uses safe disabled controls without Editor or Publish destination links", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(html).toContain("Edit project · Coming soon");
    expect(html).toContain("New content · Coming soon");
    expect(html).toContain("disabled");
    expect(html).not.toContain('href="/editor');
    expect(html).not.toContain('href="/publish');
    expect(html).not.toMatch(/href="\/workspaces\/[^"]+\/(editor|publish)/i);
  });

  it("has no sidebar and includes mobile, tablet, and desktop layout rules", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(html).not.toContain("<aside");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain("md:flex-row");
  });
});
