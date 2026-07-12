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

    for (const item of ["홈", "프로젝트", "라이브러리", "템플릿", "발행", "분석", "설정"]) expect(html).toContain(item);
    expect(html).not.toContain("<aside");
  });

  it("links the selected Workspace context to its Workspace route", () => {
    const html = renderHome({ name: "working", workspaces: [workspace], selectedWorkspaceId: workspace.id, recentProjects: [] });

    expect(html).toContain('href="/workspaces/bright-studio"');
    expect(html).toContain("워크스페이스 열기");
  });

  it("renders Continue Working only when an active project exists", () => {
    const workingHtml = renderHome({ name: "working", workspaces: [workspace], activeProject, recentProjects: [] });
    const inactiveHtml = renderHome({ name: "working", workspaces: [workspace], recentProjects: [] });

    expect(workingHtml).toContain("이어서 작업하기");
    expect(workingHtml).toContain("Active Project");
    expect(inactiveHtml).not.toContain("이어서 작업하기");
  });

  it("keeps First Visit focused without empty project sections", () => {
    const html = renderHome({ name: "first-visit", workspaces: [], recentProjects: [] });

    expect(html).toContain("첫 워크스페이스 만들기");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("이어서 작업하기");
    expect(html).not.toContain("최근 프로젝트");
    expect(html).not.toContain("라이브러리 열기");
  });

  it("keeps Empty Workspace focused on its first project", () => {
    const html = renderHome({ name: "empty-workspace", workspaces: [workspace], selectedWorkspaceId: workspace.id, recentProjects: [] });

    expect(html).toContain("이 워크스페이스의 첫 프로젝트 만들기");
    expect(html).not.toContain("이어서 작업하기");
    expect(html).not.toContain("최근 프로젝트");
    expect(html).not.toContain("템플릿 둘러보기");
  });

  it.each(["power-user", "publish-complete"] as const)("supports the %s state", (name) => {
    const html = renderHome({ name, workspaces: [workspace], selectedWorkspaceId: workspace.id, activeProject, recentProjects: [activeProject] });

    expect(html).toContain("이어서 작업하기");
    expect(html).toContain("최근 프로젝트");
    expect(html).toContain("빠른 작업");
  });
});
