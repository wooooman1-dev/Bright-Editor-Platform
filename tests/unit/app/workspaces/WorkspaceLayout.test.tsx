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

    expect(html).toContain("콘텐츠 운영 기반");
    expect(html).toContain("편집 시스템");
    expect(html).not.toContain("건강한 습관 시리즈");
    expect(state!.projects.every((project) => project.workspaceId === state!.workspace.id)).toBe(true);
  });

  it("renders a dedicated empty Workspace state without empty Project cards", () => {
    const state = getWorkspaceViewState("new-brand");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).toContain("비어 있는 워크스페이스");
    expect(html).toContain("새 브랜드의 첫 프로젝트를 만드세요");
    expect(html).not.toContain("프로젝트 열기");
  });

  it("has no sidebar and includes narrow-screen grid rules", () => {
    const state = getWorkspaceViewState("bright-studio");
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).not.toContain("<aside");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("w-full overflow-x-auto");
  });

  it("links each Project to its Workspace-scoped Dashboard route", () => {
    const state = getWorkspaceViewState("bright-studio");
    const html = renderToStaticMarkup(<WorkspaceLayout state={state!} />);

    expect(html).toContain('href="/workspaces/bright-studio/projects/content-operations"');
    expect(html).toContain('href="/workspaces/bright-studio/projects/editorial-system"');
    expect(html).not.toContain('href="/projects/');
  });
});
