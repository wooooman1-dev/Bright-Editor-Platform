import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import { EditorWorkspace } from "../../../../app/user-flow/EditorWorkspace";
import { updateEnabledPlatforms } from "../../../../app/application/settings/WorkspaceSettingsService";
import { editorPublishingPlatformVisibility } from "../../../../app/user-flow/editor-publishing-platform";
import { createContent, createProject, createWorkspace, emptyUserData, resolveProjectStrategy, type UserContent, type UserProject, type WorkspacePlatform } from "../../../../app/user-flow/user-data";

const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const editorSource = readFileSync(join(process.cwd(), "app/user-flow/EditorWorkspace.tsx"), "utf8");

describe("Tistory publishing overlay visibility", () => {
  it("keeps the global Draft outcome observer at the root and editor controls in the editor", () => {
    expect(layoutSource).toContain('import { TistoryDraftOutcomeOverlay } from "./user-flow/TistoryDraftOutcomeOverlay";');
    expect(layoutSource).toContain("<TistoryDraftOutcomeOverlay />");
    expect(layoutSource).not.toContain("TistoryScheduleOverlay");
    expect(editorSource).toContain("{tistoryEnabled ? <TistoryScheduleOverlay /> : null}");
    expect(editorSource).toContain("{wordpressEnabled ? <WordPressDraftOverlay");
  });

  it.each([
    [["tistory", "wordpress"], "tistory", { activePlatform: "tistory", tistoryEnabled: true, wordpressEnabled: false }],
    [["tistory", "wordpress"], "wordpress", { activePlatform: "wordpress", tistoryEnabled: false, wordpressEnabled: true }],
    [["wordpress"], "tistory", { activePlatform: "tistory", tistoryEnabled: false, wordpressEnabled: false }],
    [undefined, "tistory", { activePlatform: "tistory", tistoryEnabled: true, wordpressEnabled: false }],
    [[], "tistory", { activePlatform: "tistory", tistoryEnabled: false, wordpressEnabled: false }],
  ] as const)("maps Workspace %j and Project %s to one editor publishing UI", (enabledPlatforms, projectPlatform, expected) => {
    const { content, project } = editorFixture(projectPlatform);
    expect(editorPublishingPlatformVisibility({ enabledPlatforms, project, content })).toEqual(expected);
  });

  it("restores a WordPress Content target when stale generic fields say Tistory", () => {
    const fixture = editorFixture("tistory");
    const content: UserContent = {
      ...fixture.content,
      platform: "tistory",
      publishingAccountId: "tistory-legacy",
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["2"],
          categoryNames: ["생활경제"],
          updatedAt: "2026-07-29T00:00:00.000Z",
        },
      },
    };

    expect(editorPublishingPlatformVisibility({
      enabledPlatforms: ["tistory", "wordpress"],
      project: fixture.project,
      content,
    })).toEqual({ activePlatform: "wordpress", tistoryEnabled: false, wordpressEnabled: true });
  });

  it("gates Tistory data loading, rendering, preview, and scheduling together", () => {
    expect(editorSource).toContain("if (!tistoryEnabled) return;");
    expect(editorSource).toContain("if (!tistoryEnabled || !content.document) return;");
    expect(editorSource).toContain('{tistoryEnabled ? <><section className="mt-6');
    expect(editorSource).toContain("candidates={publicPostCatalogEnabled ? postCandidates : []}");
  });

  it.each([
    [["tistory"], "tistory", true, false],
    [["wordpress"], "wordpress", false, true],
    [["tistory", "wordpress"], "tistory", true, false],
    [["tistory", "wordpress"], "wordpress", false, true],
  ] as const)("renders only the %s Project UI when Workspace platforms are %j", (platforms, projectPlatform, showsTistory, showsWordPress) => {
    const html = renderEditor(platforms, projectPlatform);
    expect(html.includes("티스토리 미리보기")).toBe(showsTistory);
    expect(html.includes("Tistory 임시저장")).toBe(showsTistory);
    expect(html.includes("WordPress 임시글")).toBe(showsWordPress);
    if (!showsTistory) expect(html).not.toContain("티스토리 하단 태그");
  });
});

function editorFixture(projectPlatform: "tistory" | "wordpress"): Readonly<{ project: UserProject; content: UserContent }> {
  const workspace = createWorkspace(emptyUserData, "Studio", "workspace-platform-ui");
  const projectData = createProject(workspace, {
    id: "project-platform-ui",
    name: "Project",
    brandIdFactory: () => "brand-platform-ui",
    now: "2026-07-29T00:00:00.000Z",
  });
  const project: UserProject = {
    ...projectData.projects[0],
    strategy: { ...resolveProjectStrategy(projectData.projects[0]), defaultPlatform: projectPlatform },
  };
  const contentData = createContent({ ...projectData, projects: [project] }, {
    id: "content-platform-ui",
    projectId: "project-platform-ui",
    title: "Platform UI",
    now: "2026-07-29T00:00:00.000Z",
  });
  return Object.freeze({ project: contentData.projects[0], content: contentData.contents[0] });
}

function renderEditor(platforms: readonly WorkspacePlatform[], projectPlatform: "tistory" | "wordpress"): string {
  const workspace = createWorkspace(emptyUserData, "Studio", "workspace-platform-render");
  const configured = updateEnabledPlatforms(workspace, platforms, new Date("2026-07-29T00:00:00.000Z"));
  const fixture = editorFixture(projectPlatform);
  const project = { ...fixture.project, workspaceId: configured.workspace!.id };
  const content = { ...fixture.content, workspaceId: configured.workspace!.id, projectId: project.id };
  const data = { ...configured, projects: [project], contents: [content] };
  return renderToStaticMarkup(createElement(EditorWorkspace, {
    content,
    data,
    project,
    onBack: vi.fn(),
    onPersist: vi.fn(),
  }));
}
