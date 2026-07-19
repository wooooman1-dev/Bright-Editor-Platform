import { describe, expect, it, vi } from "vitest";

import { ContentPlanningStrategy } from "../../../../app/application/ContentPlanningStrategy";
import { completeConfirmedGeneration } from "../../../../app/user-flow/confirmed-generation";
import { createContentFromPlan, createProject, createWorkspace, emptyUserData, type UserData } from "../../../../app/user-flow/user-data";

describe("planning to Editor integration", () => {
  it("persists the confirmed ContentDocument before navigating to the Editor", async () => {
    const planningProvider = {
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          interpretedIntent: "Create a practical guide",
          domain: "health",
          targetAudience: "readers",
          contentGoal: "help",
          recommendedPrimaryKeyword: "practical guide",
          keywordCandidates: ["practical guide"],
          searchIntent: "informational",
          recommendedContentType: "guide",
          recommendedPlatforms: ["tistory"],
          suggestedTitleAngles: ["A practical guide"],
          relatedKeywords: [],
          contentCluster: [],
          recommendationReason: "Matches the request.",
          confidence: 0.9,
          estimateDisclosure: "AI estimate",
        }),
        model: "test",
      }),
    };
    const plan = await new ContentPlanningStrategy(planningProvider).analyze("Create a practical guide", undefined, { projectId: "project-1", selectionMode: "userSpecified" });
    const workspace = createWorkspace(emptyUserData, "Studio", "workspace-1");
    const projectData = createProject(workspace, { id: "project-1", name: "Project", brandIdFactory: () => "brand-1", now: "2026-07-13T00:00:00.000Z" });
    const confirmed = createContentFromPlan(projectData, {
      id: "content-1",
      projectId: "project-1",
      naturalLanguageRequest: "Create a practical guide",
      plan,
      primaryKeyword: plan.recommendedPrimaryKeyword,
      selectedPublishingAccountIds: [],
      now: "2026-07-13T00:00:01.000Z",
    });
    const document = {
      id: "content-1",
      title: "Canonical guide",
      blocks: [{ id: "block-1", type: "paragraph" as const, text: "Generated body" }],
    };
    let persisted: UserData | undefined;
    const openEditor = vi.fn();

    await completeConfirmedGeneration(
      confirmed,
      { contentId: "content-1", generated: { document }, now: "2026-07-13T00:00:02.000Z" },
      { persist: async (next) => { persisted = next; }, openEditor },
    );

    expect(planningProvider.generate).toHaveBeenCalledOnce();
    expect(persisted?.contents[0]).toMatchObject({ id: "content-1", document, status: "draft", primaryKeyword: "practical guide", planning: plan });
    expect(openEditor).toHaveBeenCalledWith("content-1");
    expect(openEditor.mock.invocationCallOrder[0]).toBeGreaterThan(0);
  });
});
