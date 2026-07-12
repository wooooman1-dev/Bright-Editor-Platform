import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectDashboard } from "../../../../app/projects/ProjectDashboard";
import { getProjectDashboardState } from "../../../../app/projects/project-dashboard-fixtures";
import { contentSummaryFixtures } from "../../../../app/shared/fixtures/content";

describe("ProjectDashboard", () => {
  it("renders the selected Workspace and Project context", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(html).toContain("콘텐츠 운영 기반");
    expect(html).toContain("Bright Studio(으)로 돌아가기");
    expect(html).toContain('href="/workspaces/bright-studio"');
    expect(html).toContain("반복 가능한 첫 콘텐츠 작업 흐름을 구축합니다.");
    expect(html).toContain("2026년 6월 18일");
  });

  it("includes only Content owned by the current Project", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(state!.contents.length).toBe(3);
    expect(state!.contents.every((content) => content.projectId === state!.project.id)).toBe(true);
    expect(html).toContain("실용적인 콘텐츠 작업 흐름");
    expect(html).not.toContain("확장 가능한 편집 원칙");
    expect(contentSummaryFixtures.some((content) => content.projectId === "editorial-system")).toBe(true);
  });

  it("renders a dedicated empty Content state for an existing Project", () => {
    const state = getProjectDashboardState("bright-studio", "launch-series");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(state!.contents).toHaveLength(0);
    expect(html).toContain("아직 콘텐츠가 없습니다");
    expect(html).toContain("첫 콘텐츠를 시작할 준비가 되었습니다");
    expect(html).toContain("출시 시리즈");
  });

  it("uses safe disabled controls without Editor or Publish destination links", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(html).toContain("프로젝트 수정 · 준비 중");
    expect(html).toContain("새 콘텐츠 · 준비 중");
    expect(html).toContain("disabled");
    expect(html).not.toContain('href="/editor');
    expect(html).not.toContain('href="/publish');
    expect(html).not.toMatch(/href="\/workspaces\/[^"]+\/(editor|publish)/i);
  });

  it("links existing Content to its Workspace-scoped Editor and keeps creation disabled", () => {
    const state = getProjectDashboardState("bright-studio", "content-operations");
    const html = renderToStaticMarkup(<ProjectDashboard state={state!} />);

    expect(html).toContain('href="/workspaces/bright-studio/projects/content-operations/contents/content-workflow-map/edit"');
    expect(html).toContain("새 콘텐츠 · 준비 중");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>새 콘텐츠/);
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
