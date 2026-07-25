import { describe, expect, it } from "vitest";

import { mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import {
  completeContentGeneration,
  completeContentPlanning,
  createContentFromPlan,
  createProject,
  createWorkspace,
  emptyUserData,
  failContentPlanning,
  selectContentPlanningOpportunity,
  startContentGeneration,
  startContentPlanning,
  type ContentPlanningResult,
  type UserData,
} from "../../../../app/user-flow/user-data";
import { createContentOpportunityCandidate } from "../../../../core/content";

const first = createContentOpportunityCandidate({
  sourceRequest: "오늘의 건강 글을 골라줘", selectionMode: "automatic", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["유산균", "식이섬유"], searchIntent: "장 건강 개선 방법 탐색", audience: "일반 성인", contentType: "guide",
  contentAngle: "실천 순서", readerProblem: "관리 기준 부족", expectedCoverage: ["식사", "생활 습관"], selectionRationale: "프로젝트 공백",
  opportunityEvidence: [{ source: "inferred", summary: "기존 콘텐츠 공백" }], confidence: 0.8, cautions: ["검색량 실측값 없음"], projectId: "project-1",
});
const second = createContentOpportunityCandidate({
  sourceRequest: "오늘의 건강 글을 골라줘", selectionMode: "automatic", selectedTopic: "만성 염증 관리", primaryKeyword: "만성 염증 관리 방법",
  secondaryKeywords: ["CRP", "항염 식단"], searchIntent: "만성 염증 관리법 탐색", audience: "중년 성인", contentType: "guide",
  contentAngle: "검사와 생활 관리", readerProblem: "검사 수치 해석 어려움", expectedCoverage: ["CRP", "식단"], selectionRationale: "미작성 주제",
  opportunityEvidence: [{ source: "estimated", summary: "AI 기획 추정" }], confidence: 0.7, cautions: ["의료 진단 아님"], projectId: "project-1",
});
const plan: ContentPlanningResult = {
  interpretedIntent: "건강 콘텐츠 공백 선정", domain: "health", targetAudience: first.audience, contentGoal: first.contentAngle,
  recommendedPrimaryKeyword: first.primaryKeyword, keywordCandidates: [first.primaryKeyword, second.primaryKeyword], searchIntent: first.searchIntent,
  recommendedContentType: first.contentType, recommendedPlatforms: ["tistory"], suggestedTitleAngles: [first.selectedTopic, second.selectedTopic],
  relatedKeywords: first.secondaryKeywords, contentCluster: first.expectedCoverage, recommendationReason: first.selectionRationale,
  confidence: first.confidence, estimateDisclosure: "AI 추정", selectionMode: "automatic", opportunityCandidates: [first, second],
};

function baseData(): UserData {
  return createProject(createWorkspace(emptyUserData, "Studio", "workspace-1"), {
    id: "project-1", name: "Health", brandIdFactory: () => "brand-1", now: "2026-07-18T00:00:00.000Z",
  });
}

function candidatesReady(): UserData {
  const started = startContentPlanning(baseData(), {
    id: "content-1", projectId: "project-1", request: "오늘의 건강 글을 골라줘", selectionMode: "automatic",
    operationId: "planning-1", now: "2026-07-18T00:01:00.000Z",
  });
  return completeContentPlanning(started, {
    workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "planning-1", plan,
    now: "2026-07-18T00:02:00.000Z",
  });
}

describe("durable Content planning workflow", () => {
  it("creates a Content-bound snapshot before AI planning and restores every candidate field", () => {
    const started = startContentPlanning(baseData(), {
      id: "content-1", projectId: "project-1", request: "오늘의 건강 글을 골라줘", selectionMode: "automatic",
      operationId: "planning-1", now: "2026-07-18T00:01:00.000Z",
    });
    expect(started.contents[0]).toMatchObject({
      id: "content-1", workspaceId: "workspace-1", projectId: "project-1", status: "planning",
      planningWorkflow: { status: "planning", operationId: "planning-1", revision: 1, lastSuccessfulStep: "request" },
    });

    const restored = completeContentPlanning(started, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "planning-1", plan,
      now: "2026-07-18T00:02:00.000Z",
    }).contents[0];
    expect(restored.planningWorkflow).toMatchObject({ status: "candidatesReady", selectedOpportunityId: first.opportunityId, revision: 2 });
    expect(restored.planning?.opportunityCandidates).toEqual([first, second]);
    expect(restored.planning?.opportunityCandidates?.[1]).toMatchObject({
      selectedTopic: second.selectedTopic, primaryKeyword: second.primaryKeyword, secondaryKeywords: second.secondaryKeywords,
      searchIntent: second.searchIntent, contentAngle: second.contentAngle, opportunityEvidence: second.opportunityEvidence,
      confidence: second.confidence, cautions: second.cautions, fingerprint: second.fingerprint,
    });
  });

  it("persists candidate selection atomically and confirms candidate B without candidate A leakage", () => {
    const ready = candidatesReady();
    const selected = selectContentPlanningOpportunity(ready, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", opportunityId: second.opportunityId,
      expectedRevision: 2, now: "2026-07-18T00:03:00.000Z",
    });
    expect(selected.contents[0].title).toBe(second.selectedTopic);
    const confirmed = createContentFromPlan(selected, {
      id: "content-1", projectId: "project-1", naturalLanguageRequest: "오늘의 건강 글을 골라줘", plan, opportunity: second,
      selectedPublishingAccountIds: [], now: "2026-07-18T00:04:00.000Z",
    }).contents[0];
    expect(confirmed.planningWorkflow).toMatchObject({ status: "opportunityConfirmed", selectedOpportunityId: second.opportunityId, revision: 4 });
    expect(confirmed.opportunity).toMatchObject({
      opportunityId: second.opportunityId, selectedTopic: second.selectedTopic, primaryKeyword: second.primaryKeyword,
      secondaryKeywords: second.secondaryKeywords, searchIntent: second.searchIntent, contentAngle: second.contentAngle,
    });
    expect(confirmed.relatedKeywords).toEqual(second.secondaryKeywords);
    expect(confirmed.relatedKeywords).not.toContain("유산균");
    expect(confirmed.qualityTarget).toEqual(second.qualityTarget);
    expect(confirmed.qualityTarget).toMatchObject({
      contentDepth: second.qualityTarget.contentDepth,
      readerProblem: second.qualityTarget.readerProblem,
      requiredContentElements: second.qualityTarget.requiredContentElements,
    });
    expect(confirmed.qualityTarget).not.toHaveProperty("targetLengthRange");
  });

  it("isolates Content and Project bindings and rejects a late response from a superseded analysis", () => {
    const ready = candidatesReady();
    expect(() => completeContentPlanning(ready, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "other-content", operationId: "planning-1", plan,
      now: "2026-07-18T00:03:00.000Z",
    })).toThrow("현재 Project");

    const reanalysis = startContentPlanning(ready, {
      id: "content-1", projectId: "project-1", request: "다시 분석", selectionMode: "automatic", operationId: "planning-2",
      now: "2026-07-18T00:03:00.000Z",
    });
    expect(() => completeContentPlanning(reanalysis, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "planning-1", plan,
      now: "2026-07-18T00:04:00.000Z",
    })).toThrow("이전 Planning 요청");
    expect(reanalysis.contents[0].planning?.opportunityCandidates).toEqual([first, second]);
    expect(reanalysis.contents[0].planningWorkflow?.operationId).toBe("planning-2");
  });

  it("persists generating, generated, and recoverable failure states", () => {
    const ready = candidatesReady();
    const confirmed = createContentFromPlan(ready, {
      id: "content-1", projectId: "project-1", naturalLanguageRequest: "오늘의 건강 글을 골라줘", plan, opportunity: first,
      selectedPublishingAccountIds: [], now: "2026-07-18T00:03:00.000Z",
    });
    const generating = startContentGeneration(confirmed, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "generation-1", now: "2026-07-18T00:04:00.000Z",
    });
    expect(generating.contents[0].planningWorkflow).toMatchObject({ status: "generating", operationId: "generation-1" });
    expect(generating.contents[0].planningWorkflow).not.toHaveProperty("retryFrom");
    const failed = failContentPlanning(generating, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "generation-1", error: "provider timeout",
      retryFrom: "generation", now: "2026-07-18T00:05:00.000Z",
    });
    expect(failed.contents[0].planningWorkflow).toMatchObject({ status: "failed", retryFrom: "generation", failedStep: "generation", error: "provider timeout" });
    const reviewFailed = failContentPlanning(generating, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "generation-1", error: "review provider timeout",
      retryFrom: "review", now: "2026-07-18T00:05:30.000Z",
    });
    expect(reviewFailed.contents[0]).toMatchObject({
      reviewError: "review provider timeout",
      planningWorkflow: { status: "failed", retryFrom: "review", failedStep: "review" },
    });
    expect(reviewFailed.contents[0].generationError).toBeUndefined();
    const restarted = startContentGeneration(createContentFromPlan(failed, {
      id: "content-1", projectId: "project-1", naturalLanguageRequest: "오늘의 건강 글을 골라줘", plan, opportunity: first,
      selectedPublishingAccountIds: [], now: "2026-07-18T00:06:00.000Z",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "generation-2", now: "2026-07-18T00:07:00.000Z" });
    const generated = completeContentGeneration(restarted, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", operationId: "generation-2", now: "2026-07-18T00:08:00.000Z",
    });
    expect(generated.contents[0].planningWorkflow).toMatchObject({ status: "generated", lastSuccessfulStep: "generation" });
    expect(generated.contents[0].planningWorkflow).not.toHaveProperty("failedStep");
  });

  it("does not let an equal or older workflow revision overwrite a newer selected candidate or other Content fields", () => {
    const ready = candidatesReady();
    const current = selectContentPlanningOpportunity({ ...ready, mediaMetadata: [{ id: "asset-1", kind: "image", source: "/api/media/1.png", metadata: { workspaceId: "workspace-1", projectId: "project-1", sourceType: "upload", alt: "보존", createdAt: "2026-07-18T00:00:00.000Z" } }] }, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", opportunityId: second.opportunityId,
      expectedRevision: 2, now: "2026-07-18T00:03:00.000Z",
    });
    const stale = { ...ready, contents: [{ ...ready.contents[0], updatedAt: "2026-07-18T00:04:00.000Z" }], mediaMetadata: [] };
    const merged = mergeUserDataSnapshot(current, stale);
    expect(merged.contents[0].planningWorkflow).toEqual(current.contents[0].planningWorkflow);
    expect(merged.contents[0].planning).toEqual(current.contents[0].planning);
    expect(merged.mediaMetadata).toEqual(current.mediaMetadata);
  });

  it("rejects a client snapshot that bypasses the stored candidate selection contract", () => {
    const ready = candidatesReady();
    const tampered = {
      ...ready,
      contents: [{
        ...ready.contents[0],
        planningWorkflow: { ...ready.contents[0].planningWorkflow!, status: "opportunitySelected" as const, selectedOpportunityId: "opportunity-forged", revision: 3 },
        updatedAt: "2026-07-18T00:03:00.000Z",
      }],
    };
    expect(() => mergeUserDataSnapshot(ready, tampered)).toThrow("저장된 Planning 후보에 없습니다");
  });
});
