import { describe, expect, it } from "vitest";

import templates from "../../../shared/templates/project-profile-defaults.json" with { type: "json" };
import { applyProjectProfileDefaults } from "../../../scripts/apply-project-profile-defaults.mjs";

function snapshot(projects) {
  return {
    data: {
      application: {
        "user-data": {
          workspace: { id: "workspace-1", name: "Bright Studio" },
          brands: [],
          contents: [{ id: "content-1", projectId: "finance", title: "보존할 글" }],
          projects,
        },
      },
      intelligence: { untouched: true },
    },
  };
}

describe("Project profile defaults migration", () => {
  it("applies the three approved profiles and preserves unrelated strategy fields", () => {
    const input = snapshot([
      {
        id: "health",
        name: "건강 정보",
        description: "",
        strategy: { primaryTopic: "건강 정보", subtopics: [], defaultPlatform: "tistory", tone: "기존 톤" },
        updatedAt: "before",
      },
      {
        id: "art",
        name: "비바레인 미술 감상 가이드",
        description: "기존 문장",
        strategy: { primaryTopic: "비바레인 미술 감상 가이드", subtopics: ["기존 문장"], defaultPlatform: "tistory" },
        updatedAt: "before",
      },
      {
        id: "finance",
        name: "밝은재테크",
        description: "밝은재테크",
        strategy: { primaryTopic: "밝은재테크", subtopics: ["밝은재테크"], defaultPlatform: "wordpress" },
        updatedAt: "before",
      },
    ]);

    const result = applyProjectProfileDefaults(input, templates, "2026-08-04T06:30:00.000Z");
    const projects = result.snapshot.data.application["user-data"].projects;

    expect(result.changedProjects).toHaveLength(3);
    expect(projects[0]).toMatchObject({
      name: "건강 정보",
      description: expect.stringContaining("일상 건강관리"),
      strategy: {
        primaryTopic: "생활건강",
        subtopics: expect.arrayContaining(["운동", "건강검진", "실손보험"]),
        defaultPlatform: "tistory",
        tone: "기존 톤",
      },
      updatedAt: "2026-08-04T06:30:00.000Z",
    });
    expect(projects[1].strategy).toMatchObject({
      primaryTopic: "서양미술 감상",
      subtopics: expect.arrayContaining(["화가", "명화", "미술사"]),
      defaultPlatform: "tistory",
    });
    expect(projects[2].strategy).toMatchObject({
      primaryTopic: "생활재테크",
      subtopics: expect.arrayContaining(["예금", "고정비 관리", "신용관리"]),
      defaultPlatform: "wordpress",
    });
    expect(result.snapshot.data.application["user-data"].contents).toEqual(input.data.application["user-data"].contents);
    expect(result.snapshot.data.intelligence).toEqual({ untouched: true });
  });

  it("leaves unknown Projects unchanged", () => {
    const project = {
      id: "unknown",
      name: "새로운 프로젝트",
      description: "사용자 설명",
      strategy: { primaryTopic: "사용자 주제", subtopics: ["직접 입력"] },
      updatedAt: "before",
    };
    const input = snapshot([project]);
    const result = applyProjectProfileDefaults(input, templates, "after");

    expect(result.changedProjects).toEqual([]);
    expect(result.snapshot.data.application["user-data"].projects[0]).toEqual(project);
  });
});
