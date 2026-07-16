import { describe, expect, it } from "vitest";

import { createContentFromPlan, createProject, createWorkspace, emptyUserData, renameProject, resolveProjectStrategy, updateProjectStrategy } from "../../../../app/user-flow/user-data";

describe("Project content strategy", () => {
  it("persists defaults and applies the default Tistory category to new Content", () => {
    let data = createWorkspace(emptyUserData, "Workspace", "workspace");
    data = createProject(data, { id: "project", name: "건강운동", brandIdFactory: () => "brand", now: "now" });
    const project = data.projects[0]; const strategy = resolveProjectStrategy(project);
    data = updateProjectStrategy(data, project.id, { ...strategy, primaryTopic: "건강운동", defaultTistoryCategory: { publishingAccountId: "account", id: "1057542", name: "건강운동" } }, "later");
    const plan = { interpretedIntent: "운동 방법", domain: "운동", targetAudience: "초보자", contentGoal: "실행", recommendedPrimaryKeyword: "아침 운동", keywordCandidates: ["아침 운동"], searchIntent: "방법 찾기", recommendedContentType: "장문 블로그", recommendedPlatforms: ["tistory"], suggestedTitleAngles: ["아침 운동"], relatedKeywords: ["스트레칭"], contentCluster: [], recommendationReason: "관련성", confidence: .9, estimateDisclosure: "추정" };
    data = createContentFromPlan(data, { id: "content", projectId: project.id, naturalLanguageRequest: "작성", plan, primaryKeyword: "아침 운동", selectedPublishingAccountIds: ["account"], now: "created" });
    expect(resolveProjectStrategy(data.projects[0]).primaryTopic).toBe("건강운동");
    expect(data.contents[0].publishingPreparation?.tistory).toMatchObject({ platformCategoryId: "1057542", platformCategoryName: "건강운동" });
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
