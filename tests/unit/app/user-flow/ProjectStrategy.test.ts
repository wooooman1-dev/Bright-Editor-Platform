import { describe, expect, it } from "vitest";

import { buildAutomaticContentPlanningRequest, createContentFromPlan, createProject, createWorkspace, emptyUserData, renameProject, resolveProjectStrategy, updateProjectStrategy } from "../../../../app/user-flow/user-data";

describe("Project content strategy", () => {
  it("keeps Project identity out of the automatic Planning request when a content scope exists", () => {
    let data = createWorkspace(emptyUserData, "Workspace", "workspace");
    data = createProject(data, { id: "project", name: "밝은재테크", description: "생활경제·재테크 콘텐츠 운영", brandIdFactory: () => "brand", now: "now" });
    const request = buildAutomaticContentPlanningRequest(resolveProjectStrategy(data.projects[0]));

    expect(request).not.toContain("밝은재테크");
    expect(request).toContain("콘텐츠 범위: 생활경제·재테크 콘텐츠 운영");
    expect(request).toContain("현재 Project에서 아직 다루지 않은 주제를 선정해");
  });

  it("persists a Project default as a proposal without applying it to new Content", () => {
    let data = createWorkspace(emptyUserData, "Workspace", "workspace");
    data = createProject(data, { id: "project", name: "건강운동", brandIdFactory: () => "brand", now: "now" });
    const project = data.projects[0]; const strategy = resolveProjectStrategy(project);
    data = updateProjectStrategy(data, project.id, { ...strategy, primaryTopic: "건강운동", defaultTistoryCategory: { publishingAccountId: "account", id: "1057542", name: "건강운동" } }, "later");
    const plan = { interpretedIntent: "운동 방법", domain: "운동", targetAudience: "초보자", contentGoal: "실행", recommendedPrimaryKeyword: "아침 운동", keywordCandidates: ["아침 운동"], searchIntent: "방법 찾기", recommendedContentType: "장문 블로그", recommendedPlatforms: ["tistory"], suggestedTitleAngles: ["아침 운동"], relatedKeywords: ["스트레칭"], contentCluster: [], recommendationReason: "관련성", confidence: .9, estimateDisclosure: "추정" };
    data = createContentFromPlan(data, { id: "content", projectId: project.id, naturalLanguageRequest: "작성", plan, primaryKeyword: "아침 운동", selectedPublishingAccountIds: ["account"], now: "created" });
    expect(resolveProjectStrategy(data.projects[0]).primaryTopic).toBe("건강운동");
    expect(data.contents[0].platform).toBe("tistory");
    expect(resolveProjectStrategy(data.projects[0]).defaultTistoryCategory).toMatchObject({ id: "1057542", name: "건강운동" });
    expect(data.contents[0].publishingPreparation?.tistory).toBeUndefined();
  });
  it("renames only the requested Project and preserves its strategy", () => {
    let data = createWorkspace(emptyUserData, "Workspace", "workspace");
    data = createProject(data, { id: "a", name: "Project A", brandIdFactory: () => "brand", now: "now" });
    data = createProject(data, { id: "b", name: "Project B", brandIdFactory: () => "brand", now: "now" });
    const topic = resolveProjectStrategy(data.projects[1]).primaryTopic;
    data = renameProject(data, "b", "  Renamed B  ", "later");
    expect(data.projects.map((project) => project.name)).toEqual(["Project A", "Renamed B"]);
    expect(resolveProjectStrategy(data.projects[1]).primaryTopic).toBe(topic);
    expect(() => renameProject(data, "b", "   ", "later")).toThrow();
  });
});
