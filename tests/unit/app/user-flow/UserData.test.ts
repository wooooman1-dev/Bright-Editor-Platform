import { describe, expect, it } from "vitest";

import { createContent, createProject, createWorkspace, emptyUserData, parseStoredUserData, saveDraft } from "../../../../app/user-flow/user-data";

describe("first-run user data", () => {
  it("starts with no Workspace, Brand, Project, or Content", () => {
    expect(emptyUserData.workspace).toBeUndefined();
    expect(emptyUserData.brands).toEqual([]);
    expect(emptyUserData.projects).toEqual([]);
    expect(emptyUserData.contents).toEqual([]);
  });

  it("creates a Workspace only after a valid name is entered", () => {
    const data = createWorkspace(emptyUserData, "  나의 작업실  ", "workspace-1");
    expect(data.workspace).toMatchObject({ id: "workspace-1", name: "나의 작업실" });
    expect(data.workspace?.createdAt).toBeTruthy();
    expect(data.workspace?.updatedAt).toBe(data.workspace?.createdAt);
    expect(data.projects).toHaveLength(0);
    expect(data.brands).toHaveLength(0);
  });

  it("creates a Project directly under the Workspace when brand name is empty", () => {
    const workspaceData = createWorkspace(emptyUserData, "나의 작업실", "workspace-1");
    const data = createProject(workspaceData, { id: "project-1", name: "개인 프로젝트", brandName: "", brandIdFactory: () => "brand-1", now: "오늘" });
    expect(data.brands).toHaveLength(0);
    expect(data.projects[0]).toMatchObject({ id: "project-1", workspaceId: "workspace-1", name: "개인 프로젝트" });
    expect(data.projects[0].brandId).toBeUndefined();
  });

  it("creates or reuses a Brand when brand name is entered", () => {
    const workspaceData = createWorkspace(emptyUserData, "나의 작업실", "workspace-1");
    const first = createProject(workspaceData, { id: "project-1", name: "건강검진", brandName: "밝은건강", brandIdFactory: () => "brand-1", now: "오늘" });
    const second = createProject(first, { id: "project-2", name: "건강운동", brandName: "밝은건강", brandIdFactory: () => "brand-2", now: "오늘" });
    expect(second.brands).toEqual([{ id: "brand-1", workspaceId: "workspace-1", name: "밝은건강" }]);
    expect(second.projects.map((project) => project.brandId)).toEqual(["brand-1", "brand-1"]);
  });

  it("creates Content in a Project and persists a changed draft", () => {
    const workspaceData = createWorkspace(emptyUserData, "나의 작업실", "workspace-1");
    const projectData = createProject(workspaceData, { id: "project-1", name: "프로젝트", brandIdFactory: () => "brand-1", now: "오늘" });
    const contentData = createContent(projectData, { id: "content-1", projectId: "project-1", title: "첫 글", now: "오늘" });
    const saved = saveDraft(contentData, { contentId: "content-1", title: "수정한 제목", body: "저장된 본문", now: "방금" });
    expect(saved.contents[0]).toMatchObject({ title: "수정한 제목", body: "저장된 본문", updatedAt: "방금" });
    expect(parseStoredUserData(JSON.stringify(saved))).toEqual(saved);
  });
});
