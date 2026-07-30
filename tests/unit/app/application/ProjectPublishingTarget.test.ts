import { describe, expect, it } from "vitest";

import {
  applyProjectPublishingTargets,
  projectPublishingAccountIds,
  resolveCanonicalPublishingConnection,
} from "../../../../app/application/publishing/ProjectPublishingTarget";
import { createContentFromPlan, createProject, createWorkspace, emptyUserData } from "../../../../app/user-flow/user-data";
import type { PlatformConnection } from "../../../../core/connections";

const connections = [
  { id: "tistory-1", platform: "tistory" },
  { id: "wordpress-1", platform: "wordpress" },
] as const;

describe("Project publishing target", () => {
  it.each([
    ["tistory-1", "tistory"],
    ["wordpress-1", "wordpress"],
  ] as const)("makes a single %s account the canonical Project platform", (accountId, platform) => {
    const next = applyProjectPublishingTargets(baseData(), "project-1", [accountId], connections, "later");

    expect(next.projects[0]).toMatchObject({
      selectedPublishingAccountIds: [accountId],
      strategy: { defaultPlatform: platform, defaultPublishingAccountId: accountId },
      updatedAt: "later",
    });
  });

  it("preserves the explicit default when more than one platform target remains selected", () => {
    const wordpress = applyProjectPublishingTargets(baseData(), "project-1", ["wordpress-1"], connections, "wordpress-default");
    const both = applyProjectPublishingTargets(wordpress, "project-1", ["wordpress-1", "tistory-1"], connections, "both");

    expect(both.projects[0]).toMatchObject({
      selectedPublishingAccountIds: ["wordpress-1", "tistory-1"],
      strategy: { defaultPlatform: "wordpress", defaultPublishingAccountId: "wordpress-1" },
    });
  });

  it("stores WordPress on a new single-target Content and excludes Tistory preparation", () => {
    const targeted = applyProjectPublishingTargets(baseData(), "project-1", ["wordpress-1"], connections, "targeted");
    const next = createContentFromPlan(targeted, {
      id: "content-1",
      projectId: "project-1",
      naturalLanguageRequest: "생활경제 글 작성",
      plan: {
        interpretedIntent: "생활경제 정보",
        domain: "생활경제",
        targetAudience: "일반 독자",
        contentGoal: "정보 제공",
        recommendedPrimaryKeyword: "생활경제",
        keywordCandidates: ["생활경제"],
        searchIntent: "정보 탐색",
        recommendedContentType: "장문 블로그",
        recommendedPlatforms: ["wordpress"],
        suggestedTitleAngles: ["생활경제 안내"],
        relatedKeywords: ["금리"],
        contentCluster: [],
        recommendationReason: "Project 기본 플랫폼",
        confidence: 0.9,
        estimateDisclosure: "AI 추정",
      },
      primaryKeyword: "생활경제",
      selectedPublishingAccountIds: ["wordpress-1"],
      now: "created",
    });

    expect(next.contents[0]).toMatchObject({
      platform: "wordpress",
      publishingAccountId: "wordpress-1",
      selectedPublishingAccountIds: ["wordpress-1"],
    });
    expect(projectPublishingAccountIds(next, "project-1", ["wordpress-1", "tistory-1"], connections, "tistory")).toEqual([]);
  });

  it("returns only Tistory accounts when Tistory remains the Project default", () => {
    const targeted = applyProjectPublishingTargets(baseData(), "project-1", ["tistory-1"], connections, "targeted");

    expect(projectPublishingAccountIds(targeted, "project-1", ["wordpress-1", "tistory-1"], connections, "tistory"))
      .toEqual(["tistory-1"]);
  });

  it.each([
    ["wordpress", "wordpress-1"],
    ["tistory", "tistory-1"],
  ] as const)("selects only the Content canonical %s connection when both platforms are active", (platform, connectionId) => {
    const targeted = applyProjectPublishingTargets(baseData(), "project-1", [connectionId], connections, "targeted");
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "Canonical target",
      body: "",
      status: "in_review" as const,
      platform,
      selectedPublishingAccountIds: ["tistory-1", "wordpress-1"],
      publishingAccountId: connectionId,
      updatedAt: "now",
    };
    const data = { ...targeted, contents: [content] };

    expect(resolveCanonicalPublishingConnection(data, content, platformConnections())?.id).toBe(connectionId);
  });

  it("prefers the Content WordPress preparation over a stale Tistory account field", () => {
    const targeted = applyProjectPublishingTargets(baseData(), "project-1", ["tistory-1", "wordpress-1"], connections, "targeted");
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "WordPress prepared",
      body: "",
      status: "in_review" as const,
      platform: "tistory",
      publishingAccountId: "tistory-1",
      updatedAt: "now",
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["12"],
          categoryNames: ["생활경제"],
          updatedAt: "now",
        },
      },
    };
    const data = { ...targeted, contents: [content] };

    expect(resolveCanonicalPublishingConnection(data, content, platformConnections())?.id).toBe("wordpress-1");
  });
});

function baseData() {
  const workspace = createWorkspace(emptyUserData, "Studio", "workspace-1");
  return createProject(workspace, {
    id: "project-1",
    name: "Project",
    brandIdFactory: () => "brand-1",
    now: "now",
  });
}

function platformConnections(): readonly PlatformConnection[] {
  return connections.map((connection) => ({
    ...connection,
    workspaceId: "workspace-1",
    displayName: connection.id,
    status: "connected" as const,
    publicMetadata: {},
    createdAt: "now",
    updatedAt: "now",
    selectedAsDefault: false,
    version: 1,
  }));
}
