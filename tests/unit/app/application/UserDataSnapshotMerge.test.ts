import { describe, expect, it } from "vitest";

import { mergeServerMutationSnapshot, mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import type { MediaAsset } from "../../../../core/media";
import type { UserData } from "../../../../app/user-flow/user-data";
import { confirmContentOpportunity, createContentOpportunityCandidate } from "../../../../core/content";

const mediaAsset: MediaAsset = Object.freeze({
  id: "asset-server",
  kind: "image",
  metadata: Object.freeze({
    alt: "서버 이미지",
    contentId: "content-1",
    createdAt: "2026-07-18T01:00:00.000Z",
    projectId: "project-1",
    sourceType: "upload",
    workspaceId: "workspace-1",
  }),
  source: "/api/media/server.png",
});

function snapshot(overrides: Partial<UserData> = {}): UserData {
  return {
    workspace: { id: "workspace-1", name: "Workspace" },
    brands: [],
    projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" }],
    contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: "Server title", body: "", status: "draft", updatedAt: "2026-07-18T00:00:00.000Z" }],
    history: [],
    mediaMetadata: [],
    publishingRecords: [],
    qualityReports: [],
    scheduledPublishing: [],
    ...overrides,
  };
}

describe("mergeUserDataSnapshot", () => {
  it("preserves the latest server media metadata during a stale full-state save", () => {
    const current = snapshot({ mediaMetadata: [mediaAsset] });
    const incoming = snapshot({
      contents: [{ ...current.contents[0], title: "Client edited title" }],
      mediaMetadata: [],
    });

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents[0].title).toBe("Client edited title");
    expect(merged.mediaMetadata).toEqual([mediaAsset]);
  });

  it("keeps server-owned workflow collections and server quality", () => {
    const serverQuality = quality(99);
    const clientQuality = quality(1);
    const current = snapshot({
      contents: [{ ...snapshot().contents[0], quality: serverQuality }],
      history: [{ id: "history-server", contentId: "content-1", document: { id: "content-1", title: "Server", blocks: [] }, reason: "autosave", recordedAt: "2026-07-18T01:00:00.000Z", version: 1 }],
      publishingRecords: [{ id: "publish-server", contentId: "content-1", platformConnectionId: "connection-1", status: "saved", createdAt: "2026-07-18T01:00:00.000Z" }],
      qualityReports: [{ contentId: "content-1", report: serverQuality }],
      scheduledPublishing: [{ contentId: "content-1", platform: "tistory", scheduledFor: "2026-07-19T01:00:00.000Z" }],
    });
    const incoming = snapshot({ contents: [{ ...current.contents[0], quality: clientQuality }] });

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents[0].quality).toBe(serverQuality);
    expect(merged.history).toEqual(current.history);
    expect(merged.publishingRecords).toEqual(current.publishingRecords);
    expect(merged.qualityReports).toEqual(current.qualityReports);
    expect(merged.scheduledPublishing).toEqual(current.scheduledPublishing);
  });

  it("keeps a user-edited image prompt and ALT through the full-state autosave merge", () => {
    const originalDocument = { id: "content-1", title: "원고", blocks: [{ id: "image-1", type: "image" as const, source: "/api/media/image.png", sourceType: "upload" as const, assetId: "asset-1", alt: "기존 ALT", prompt: "기존 프롬프트", purpose: "inline" as const }] };
    const current = snapshot({ contents: [{ ...snapshot().contents[0], document: originalDocument }] });
    const editedDocument = { ...originalDocument, blocks: [{ ...originalDocument.blocks[0], alt: "사용자 수정 ALT", prompt: "사용자가 섹션 문맥에 맞게 수정한 프롬프트" }] };
    const incoming = snapshot({ contents: [{ ...current.contents[0], document: editedDocument }] });

    const merged = mergeUserDataSnapshot(current, incoming);
    const image = merged.contents[0].document?.blocks[0];
    expect(image).toMatchObject({ alt: "사용자 수정 ALT", prompt: "사용자가 섹션 문맥에 맞게 수정한 프롬프트", source: "/api/media/image.png", assetId: "asset-1" });
  });

  it("does not let an older autosave restore the title that existed before server generation", () => {
    const generated = snapshot({ contents: [{ ...snapshot().contents[0], title: "장 건강 관리 방법: 만성 염증 관리 가이드", updatedAt: "2026-07-18T02:00:00.000Z" }] });
    const stale = snapshot({ contents: [{ ...snapshot().contents[0], title: "만성 염증 관리 가이드", updatedAt: "2026-07-18T01:59:59.000Z" }] });

    expect(mergeUserDataSnapshot(generated, stale).contents[0].title).toBe("장 건강 관리 방법: 만성 염증 관리 가이드");
  });

  it("does not let a later legacy autosave remove or mix the confirmed Opportunity", () => {
    const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "장 건강 글", selectionMode: "userSpecified", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
      secondaryKeywords: ["유산균"], searchIntent: "장 건강 개선 탐색", audience: "성인", contentType: "article", contentAngle: "실천 안내",
      readerProblem: "관리 기준 부족", expectedCoverage: ["유산균"], selectionRationale: "사용자 지정", opportunityEvidence: [{ source: "unknown", summary: "외부 데이터 없음" }],
      confidence: 0.8, cautions: [], projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-18T01:00:00.000Z" });
    const current = snapshot({ contents: [{ ...snapshot().contents[0], opportunity, primaryKeyword: opportunity.primaryKeyword, relatedKeywords: opportunity.secondaryKeywords, searchIntent: opportunity.searchIntent, updatedAt: "2026-07-18T01:00:00.000Z" }] });
    const staleShape = snapshot({ contents: [{ ...snapshot().contents[0], primaryKeyword: "만성 염증 관리 방법", relatedKeywords: ["CRP"], searchIntent: "만성 염증", updatedAt: "2026-07-18T02:00:00.000Z" }] });
    const merged = mergeUserDataSnapshot(current, staleShape).contents[0];
    expect(merged.opportunity).toBe(opportunity);
    expect(merged).toMatchObject({ primaryKeyword: opportunity.primaryKeyword, relatedKeywords: ["유산균"], searchIntent: opportunity.searchIntent });
  });

  it("does not let a stale snapshot remove another Content created on the server", () => {
    const current = snapshot({ contents: [snapshot().contents[0], { ...snapshot().contents[0], id: "content-2", title: "다른 콘텐츠" }] });
    const stale = snapshot({ contents: [snapshot().contents[0]] });

    expect(mergeUserDataSnapshot(current, stale).contents.map((content) => content.id)).toEqual(["content-1", "content-2"]);
  });

  it("persists a failed workflow without revalidating or deleting an unchanged legacy Planning snapshot", () => {
    const currentCandidate = createContentOpportunityCandidate({
      sourceRequest: "건강 주제 선정", selectionMode: "automatic", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
      secondaryKeywords: [], searchIntent: "장 건강 관리 탐색", audience: "성인", contentType: "guide", contentAngle: "실천 안내",
      readerProblem: "관리 기준 부족", expectedCoverage: [], selectionRationale: "기존 콘텐츠 공백", opportunityEvidence: [{ source: "inferred", summary: "내부 추론" }],
      confidence: 0.7, cautions: [], projectId: "project-1",
    });
    const legacyCandidate = { ...currentCandidate, fingerprint: "fp-legacy-before-classification" };
    const planning = { interpretedIntent: "건강 주제 선정", domain: "health", targetAudience: "성인", contentGoal: "실천 안내", recommendedPrimaryKeyword: legacyCandidate.primaryKeyword, keywordCandidates: [legacyCandidate.primaryKeyword], searchIntent: legacyCandidate.searchIntent, recommendedContentType: "guide", recommendedPlatforms: [], suggestedTitleAngles: [legacyCandidate.selectedTopic], relatedKeywords: [], contentCluster: [], recommendationReason: "기존 콘텐츠 공백", confidence: 0.7, estimateDisclosure: "외부 데이터 없음", selectionMode: "automatic" as const, opportunityCandidates: [legacyCandidate] };
    const workflow = { status: "candidatesReady" as const, request: "건강 주제 선정", selectionMode: "automatic" as const, operationId: "operation-1", selectedOpportunityId: legacyCandidate.opportunityId, lastSuccessfulStep: "planning" as const, revision: 2, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:01:00.000Z" };
    const current = snapshot({ contents: [{ ...snapshot().contents[0], planning: planning as never, planningWorkflow: workflow }] });
    const incoming = snapshot({ contents: [{ ...current.contents[0], planning: undefined, planningWorkflow: { ...workflow, status: "failed", error: "provider timeout", retryFrom: "planning", revision: 3, updatedAt: "2026-07-18T00:02:00.000Z" }, updatedAt: "2026-07-18T00:02:00.000Z" }] });

    const merged = mergeUserDataSnapshot(current, incoming).contents[0];

    expect(merged.planning).toBe(planning);
    expect(merged.planningWorkflow).toMatchObject({ status: "failed", error: "provider timeout", retryFrom: "planning", revision: 3 });
  });

  it("accepts the first valid snapshot when no server state exists", () => {
    const incoming = snapshot({ mediaMetadata: [mediaAsset] });
    expect(mergeUserDataSnapshot(undefined, incoming)).toBe(incoming);
  });

  it("rejects malformed full-state payloads", () => {
    expect(() => mergeUserDataSnapshot(undefined, { contents: [] })).toThrow("Application state is invalid.");
  });
});

describe("mergeServerMutationSnapshot", () => {
  it("keeps concurrent media uploads while applying a completed server workflow", () => {
    const base = snapshot();
    const current = snapshot({ mediaMetadata: [mediaAsset] });
    const workflowHistory = { id: "history-workflow", contentId: "content-1", document: { id: "content-1", title: "Workflow", blocks: [] }, reason: "ai_revision" as const, recordedAt: "2026-07-18T02:00:00.000Z", version: 2 };
    const next = snapshot({
      contents: [{ ...base.contents[0], title: "AI reviewed title" }],
      history: [workflowHistory],
    });

    const merged = mergeServerMutationSnapshot(current, base, next);

    expect(merged.contents[0].title).toBe("AI reviewed title");
    expect(merged.mediaMetadata).toEqual([mediaAsset]);
    expect(merged.history).toEqual([workflowHistory]);
  });

  it("applies changed workflow records without overwriting newer unrelated records", () => {
    const baseQualityA = quality(70);
    const baseQualityB = quality(75);
    const currentQualityB = quality(96);
    const nextQualityA = quality(98);
    const base = snapshot({ qualityReports: [{ contentId: "content-1", report: baseQualityA }, { contentId: "content-2", report: baseQualityB }] });
    const current = snapshot({ qualityReports: [{ contentId: "content-1", report: baseQualityA }, { contentId: "content-2", report: currentQualityB }] });
    const next = snapshot({ qualityReports: [{ contentId: "content-1", report: nextQualityA }, { contentId: "content-2", report: baseQualityB }] });

    const merged = mergeServerMutationSnapshot(current, base, next);

    expect(merged.qualityReports).toEqual([
      { contentId: "content-1", report: nextQualityA },
      { contentId: "content-2", report: currentQualityB },
    ]);
  });

  it("applies a generated canonical title without replacing concurrently updated keyword planning fields", () => {
    const baseContent = { ...snapshot().contents[0], primaryKeyword: "장 건강 관리 방법", interpretedIntent: "장 건강 안내" };
    const base = snapshot({ contents: [baseContent] });
    const current = snapshot({ contents: [{ ...baseContent, planning: { interpretedIntent: "장 건강 안내", domain: "health", targetAudience: "성인", contentGoal: "실천 안내", recommendedPrimaryKeyword: "장 건강 관리 방법", keywordCandidates: ["장 건강 관리 방법"], searchIntent: "정보형", recommendedContentType: "article", recommendedPlatforms: [], suggestedTitleAngles: [], relatedKeywords: [], contentCluster: [], recommendationReason: "요청 일치", confidence: 0.9, estimateDisclosure: "AI estimate" } }] });
    const generatedDocument = { id: "content-1", title: "장 건강 관리 방법: 만성 염증 관리 가이드", blocks: [] };
    const next = snapshot({ contents: [{ ...baseContent, title: generatedDocument.title, document: generatedDocument }] });

    const merged = mergeServerMutationSnapshot(current, base, next).contents[0];

    expect(merged.primaryKeyword).toBe("장 건강 관리 방법");
    expect(merged.planning?.recommendedPrimaryKeyword).toBe("장 건강 관리 방법");
    expect(merged.title).toBe(generatedDocument.title);
    expect(merged.document?.title).toBe(generatedDocument.title);
  });
});

function quality(score: number): NonNullable<UserData["contents"][number]["quality"]> {
  return { overallScore: score, approved: score >= 95 } as unknown as NonNullable<UserData["contents"][number]["quality"]>;
}
