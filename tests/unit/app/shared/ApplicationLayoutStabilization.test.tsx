import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContentEditor } from "../../../../app/contents/ContentEditor";
import { getContentEditorState } from "../../../../app/contents/content-editor-fixtures";
import DevDashboard from "../../../../app/dev/page";
import { HomeLayout } from "../../../../app/home/HomeLayout";
import type { HomeState } from "../../../../app/home/home-state";
import { ProjectDashboard } from "../../../../app/projects/ProjectDashboard";
import { getProjectDashboardState } from "../../../../app/projects/project-dashboard-fixtures";
import { PublishPreparation } from "../../../../app/publish/PublishPreparation";
import { getPublishPreparationState } from "../../../../app/publish/publish-preparation-fixtures";
import { GlobalHeader } from "../../../../app/shared/ui/GlobalHeader";
import type { WorkspaceSummary } from "../../../../app/shared/view-models/workspace";
import { WorkspaceLayout } from "../../../../app/workspaces/WorkspaceLayout";
import { getWorkspaceViewState } from "../../../../app/workspaces/workspace-fixtures";

const containerClasses = "mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10";
const workspace: WorkspaceSummary = { id: "bright-studio", name: "Bright Studio" };

describe("Application layout stabilization", () => {
  it("hides Workspace context for zero workspaces", () => {
    const html = renderToStaticMarkup(<GlobalHeader activeItem="Home" workspaces={[]} />);

    expect(html).not.toContain("<select");
    expect(html).not.toContain("워크스페이스 전환 준비 중");
  });

  it("shows only the current Workspace name for one workspace", () => {
    const html = renderToStaticMarkup(<GlobalHeader activeItem="Home" selectedWorkspaceId={workspace.id} workspaces={[workspace]} />);

    expect(html).toContain(">Bright Studio</span>");
    expect(html).not.toContain("<select");
    expect(html).toContain('href="/workspaces/bright-studio/settings"');
  });

  it("shows a disabled Select only for two or more workspaces", () => {
    const html = renderToStaticMarkup(<GlobalHeader activeItem="Home" selectedWorkspaceId={workspace.id} workspaces={[workspace, { id: "second", name: "두 번째 브랜드" }]} />);

    expect(html).toContain("<select");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-disabled="true"');
  });

  it("uses the same container baseline in every user screen Header and Main", () => {
    const homeState: HomeState = { name: "working", workspaces: [workspace], selectedWorkspaceId: workspace.id, recentProjects: [] };
    const screens = [
      renderToStaticMarkup(<HomeLayout state={homeState} />),
      renderToStaticMarkup(<WorkspaceLayout state={getWorkspaceViewState("bright-studio")!} />),
      renderToStaticMarkup(<ProjectDashboard state={getProjectDashboardState("bright-studio", "content-operations")!} />),
      renderToStaticMarkup(<ContentEditor state={getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!} />),
      renderToStaticMarkup(<PublishPreparation state={getPublishPreparationState("bright-studio", "content-operations", "content-workflow-map")!} />),
    ];

    for (const html of screens) {
      expect(html.split(containerClasses)).toHaveLength(3);
      expect(html).not.toContain("max-w-5xl");
    }
  });

  it("keeps the development screen separate from Workspace Selector UI", async () => {
    const page = await DevDashboard({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain("워크스페이스 전환 준비 중");
    expect(html).not.toContain('aria-label="전체 탐색"');
  });
});
