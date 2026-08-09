import { describe, expect, it } from "vitest";

import { mergeServerMutationSnapshot, mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import type { MediaAsset } from "../../../../core/media";
import type { UserData } from "../../../../app/user-flow/user-data";
import type { PublishingExecutionRecord } from "../../../../core/publishing";
import { confirmContentOpportunity, createContentOpportunityCandidate, createContentOpportunityVerificationPlan, resolveContentOpportunityVerificationMode } from "../../../../core/content";

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
  it("preserves explicit empty verification Planning while legacy absence remains unknown", () => {
    const base = createContentOpportunityCandidate({
      sourceRequest: "명세서 확인", selectionMode: "userSpecified", selectedTopic: "명세서 확인 방법",
      primaryKeyword: "명세서 확인 방법", secondaryKeywords: [], searchIntent: "확인 순서", audience: "이용자",
      contentType: "article", contentAngle: "순서", readerProblem: "판단 어려움", expectedCoverage: ["확인"],
      selectionRationale: "실용", opportunityEvidence: [], confidence: 0.8, cautions: [], projectId: "project-1",
      verificationPlan: createContentOpportunityVerificationPlan([]),
    });
    const opportunity = confirmContentOpportunity(base, { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-08-09T00:00:00.000Z" });
    const persisted = mergeUserDataSnapshot(undefined, JSON.parse(JSON.stringify(snapshot({ contents: [{ ...snapshot().contents[0], opportunity }] }))));
    expect(persisted.contents[0].opportunity?.verificationPlan).toMatchObject({ mode: "explicit", claims: [] });
    expect(resolveContentOpportunityVerificationMode(persisted.contents[0].opportunity!)).toBe("explicit");

    expect(resolveContentOpportunityVerificationMode({})).toBe("legacy");
  });

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

  it("keeps the latest persistent WordPress completion when a stale browser snapshot is saved", () => {
    const completion: PublishingExecutionRecord = {
      schemaVersion: 1,
      id: "wordpress-key",
      idempotencyKey: "wordpress-key",
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      contentRevisionId: "rev-1",
      platformConnectionId: "wordpress-1",
      platform: "wordpress",
      workflow: "draft.create",
      status: "verified",
      stage: "complete",
      externalPostId: "501",
      verified: true,
      uploadedMedia: [{ assetId: "asset-1", externalMediaId: "91" }],
      cleanupRequired: false,
      verificationChecks: [{ key: "status", passed: true }],
      categoryIds: ["12"],
      categoryNames: ["Household"],
      localImageCount: 1,
      featuredImageAssigned: true,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:01:00.000Z",
    };
    const current = snapshot({ publishingRecords: [completion] });
    const stale = snapshot({ publishingRecords: [] });

    expect(mergeUserDataSnapshot(current, stale).publishingRecords).toEqual([completion]);
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

  it("replaces an earlier confirmed Opportunity when a newer browser snapshot confirms the newly selected candidate", () => {
    const firstCandidate = createContentOpportunityCandidate({
      sourceRequest: "건강 글", selectionMode: "automatic", selectedTopic: "지방간 생활관리 원칙", primaryKeyword: "지방간 관리 방법",
      secondaryKeywords: ["지방간 식단"], searchIntent: "지방간 관리 방법을 찾는 정보 탐색", audience: "건강검진 독자", contentType: "guide", contentAngle: "생활관리",
      readerProblem: "지방간 관리 방법이 필요함", expectedCoverage: [], selectionRationale: "첫 번째 후보", opportunityEvidence: [{ source: "unknown", summary: "테스트" }], confidence: 0.8, cautions: [], projectId: "project-1",
    });
    const secondCandidate = createContentOpportunityCandidate({
      sourceRequest: "건강 글", selectionMode: "automatic", selectedTopic: "건강검진 결과표의 주요 수치 이해와 후속 관리", primaryKeyword: "건강검진 결과표 읽는 법",
      secondaryKeywords: ["건강검진 수치"], searchIntent: "건강검진 결과를 이해하려는 정보 탐색", audience: "건강검진 독자", contentType: "guide", contentAngle: "결과 해석",
      readerProblem: "검진표 해석이 필요함", expectedCoverage: [], selectionRationale: "두 번째 후보", opportunityEvidence: [{ source: "unknown", summary: "테스트" }], confidence: 0.8, cautions: [], projectId: "project-1",
    });
    const first = confirmContentOpportunity(firstCandidate, { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-20T12:00:00.000Z" });
    const second = confirmContentOpportunity(secondCandidate, { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-20T12:01:00.000Z" });
    const planning = {
      interpretedIntent: "건강 글", domain: "health", targetAudience: "건강검진 독자", contentGoal: "건강 정보",
      recommendedPrimaryKeyword: first.primaryKeyword, keywordCandidates: [first.primaryKeyword, second.primaryKeyword], searchIntent: first.searchIntent,
      recommendedContentType: "guide", recommendedPlatforms: ["tistory"], suggestedTitleAngles: [first.selectedTopic, second.selectedTopic],
      relatedKeywords: [], contentCluster: [], recommendationReason: "후보 비교", confidence: 0.8, estimateDisclosure: "테스트",
      opportunityCandidates: [firstCandidate, secondCandidate],
    };
    const current = snapshot({ contents: [{
      ...snapshot().contents[0], title: first.selectedTopic, opportunity: first, planning: planning as never, primaryKeyword: first.primaryKeyword,
      relatedKeywords: first.secondaryKeywords, searchIntent: first.searchIntent, contentType: first.contentType,
      planningWorkflow: { status: "opportunityConfirmed", request: "건강 글", selectionMode: "automatic", operationId: "planning-1", revision: 5, selectedOpportunityId: first.opportunityId, lastSuccessfulStep: "confirmation", createdAt: "2026-07-20T11:00:00.000Z", updatedAt: "2026-07-20T12:00:00.000Z" },
      updatedAt: "2026-07-20T12:00:00.000Z",
    }] });
    const selected = mergeUserDataSnapshot(current, snapshot({ contents: [{
      ...current.contents[0], title: second.selectedTopic,
      planningWorkflow: { ...current.contents[0].planningWorkflow!, status: "opportunitySelected", revision: 6, selectedOpportunityId: second.opportunityId, lastSuccessfulStep: "selection", updatedAt: "2026-07-20T12:00:30.000Z" },
      updatedAt: "2026-07-20T12:00:30.000Z",
    }] }));
    const confirmed = mergeUserDataSnapshot(selected, snapshot({ contents: [{
      ...selected.contents[0], title: second.selectedTopic, opportunity: second, primaryKeyword: second.primaryKeyword, relatedKeywords: second.secondaryKeywords, searchIntent: second.searchIntent, contentType: second.contentType,
      planningWorkflow: { ...selected.contents[0].planningWorkflow!, status: "opportunityConfirmed", revision: 7, selectedOpportunityId: second.opportunityId, lastSuccessfulStep: "confirmation", updatedAt: "2026-07-20T12:01:00.000Z" },
      updatedAt: "2026-07-20T12:01:00.000Z",
    }] }));

    expect(confirmed.contents[0].planningWorkflow?.selectedOpportunityId).toBe(second.opportunityId);
    expect(confirmed.contents[0].opportunity?.opportunityId).toBe(second.opportunityId);
    expect(confirmed.contents[0].primaryKeyword).toBe(second.primaryKeyword);
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

  it("does not let an older saved candidate overwrite a newly completed Today's Content candidate snapshot", () => {
    const oldCandidate = createContentOpportunityCandidate({
      sourceRequest: "오늘의 글", selectionMode: "automatic", selectedTopic: "기존 후보", primaryKeyword: "기존 후보 방법",
      secondaryKeywords: [], searchIntent: "기존 후보를 확인하는 방법 탐색", audience: "독자", contentType: "guide", contentAngle: "기존",
      readerProblem: "기존 문제", expectedCoverage: [], selectionRationale: "내부 공백", opportunityEvidence: [{ source: "inferred", summary: "내부 근거" }],
      confidence: 0, cautions: [], projectId: "project-1",
    });
    const freshCandidate = createContentOpportunityCandidate({
      sourceRequest: "오늘의 글", selectionMode: "automatic", selectedTopic: "휴면예금 찾는 방법", primaryKeyword: "휴면예금 찾는 방법",
      secondaryKeywords: ["예금"], searchIntent: "휴면예금을 조회하고 지급 신청 전 확인하는 방법 탐색", audience: "독자", contentType: "guide", contentAngle: "공식 조회",
      readerProblem: "숨은 예금을 찾기 어려움", expectedCoverage: [], selectionRationale: "NAVER 상대 추세와 내부 공백",
      opportunityEvidence: [{ source: "verified", summary: "NAVER relativeTrend", evidenceId: "evidence-naver", provider: "naverSearchTrend", evidenceType: "relativeTrend", freshness: "fresh", verified: true }],
      recommendationType: "marketOpportunity", evidenceIds: ["evidence-naver"], marketEvidenceStatus: "verified", internalGrowthEvidenceStatus: "verified", freshness: "fresh", limitations: ["NAVER ratio is not absolute search volume."], classificationVersion: 1,
      confidence: 0.8, cautions: [], projectId: "project-1",
    });
    const plan = (candidate: typeof oldCandidate) => ({
      interpretedIntent: "오늘의 글", domain: "finance", targetAudience: "독자", contentGoal: "정보 제공",
      recommendedPrimaryKeyword: candidate.primaryKeyword, keywordCandidates: [candidate.primaryKeyword], searchIntent: candidate.searchIntent,
      recommendedContentType: "guide", recommendedPlatforms: [], suggestedTitleAngles: [candidate.selectedTopic], relatedKeywords: candidate.secondaryKeywords,
      contentCluster: [], recommendationReason: candidate.selectionRationale, confidence: candidate.confidence, estimateDisclosure: "근거 설명",
      selectionMode: "automatic" as const, opportunityCandidates: [candidate],
    });
    const current = snapshot({ contents: [{
      ...snapshot().contents[0], title: freshCandidate.selectedTopic, planning: plan(freshCandidate) as never,
      planningWorkflow: { status: "candidatesReady", request: "오늘의 글", selectionMode: "automatic", operationId: "new-operation", revision: 2, selectedOpportunityId: freshCandidate.opportunityId, lastSuccessfulStep: "planning", createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:02:00.000Z" },
      updatedAt: "2026-08-05T00:02:00.000Z",
    }] });
    const stale = snapshot({ contents: [{
      ...snapshot().contents[0], title: oldCandidate.selectedTopic, planning: plan(oldCandidate) as never,
      planningWorkflow: { status: "candidatesReady", request: "오늘의 글", selectionMode: "automatic", operationId: "old-operation", revision: 1, selectedOpportunityId: oldCandidate.opportunityId, lastSuccessfulStep: "planning", createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:01:00.000Z" },
      updatedAt: "2026-08-05T00:03:00.000Z",
    }] });

    const merged = mergeUserDataSnapshot(current, stale).contents[0];

    expect(merged.planningWorkflow).toBe(current.contents[0].planningWorkflow);
    expect(merged.planning).toBe(current.contents[0].planning);
    expect(merged.planning?.opportunityCandidates?.[0].opportunityId).toBe(freshCandidate.opportunityId);
    expect(merged.planning?.opportunityCandidates?.[0].evidenceIds).toEqual(["evidence-naver"]);
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

  it("does not revalidate an unchanged legacy confirmed Opportunity while saving another Content", () => {
    const valid = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "기존 건강 글", selectionMode: "automatic", selectedTopic: "기존 건강 관리", primaryKeyword: "기존 건강 관리 방법",
      secondaryKeywords: [], searchIntent: "기존 건강 정보 탐색", audience: "성인", contentType: "guide", contentAngle: "실천 안내",
      readerProblem: "관리 기준 부족", expectedCoverage: [], selectionRationale: "기존 후보", opportunityEvidence: [{ source: "unknown", summary: "기존 근거" }],
      confidence: 0.7, cautions: [], projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "legacy-content", confirmedAt: "2026-07-18T00:00:00.000Z" });
    const legacy = { ...valid, fingerprint: "fp-before-dynamic-target" };
    const current = snapshot({ contents: [
      { ...snapshot().contents[0], id: "legacy-content", opportunity: legacy as never, primaryKeyword: legacy.primaryKeyword, relatedKeywords: legacy.secondaryKeywords, searchIntent: legacy.searchIntent },
      { ...snapshot().contents[0], id: "new-content", title: "새 콘텐츠" },
    ] });
    const incoming = snapshot({ contents: [
      current.contents[0],
      { ...current.contents[1], title: "확정된 새 콘텐츠", updatedAt: "2026-07-18T00:01:00.000Z" },
    ] });

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents.find((item) => item.id === "legacy-content")).toBe(current.contents[0]);
    expect(merged.contents.find((item) => item.id === "new-content")?.title).toBe("확정된 새 콘텐츠");
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
