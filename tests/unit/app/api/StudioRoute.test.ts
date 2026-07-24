import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: storeMocks }));

import { studioStore } from "../../../../app/application/studio-store";
import { POST, PUT } from "../../../../app/api/studio/route";
import type { UserData } from "../../../../app/user-flow/user-data";
import { confirmContentOpportunity, createContentOpportunityCandidate } from "../../../../core/content";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "canonical guide", selectionMode: "userSpecified", selectedTopic: "Canonical guide", primaryKeyword: "canonical",
  secondaryKeywords: [], searchIntent: "canonical guide", audience: "readers", contentType: "guide", contentAngle: "practical guide",
  readerProblem: "needs a canonical guide", expectedCoverage: [], selectionRationale: "user specified",
  opportunityEvidence: [{ source: "unknown", summary: "no keyword data" }], confidence: 0.8, cautions: [], projectId: "project-1",
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });

const koreanRequest = "50대를 위한 아침 운동 루틴 관련글을 만들고 싶어";
const planningResult = {
  interpretedIntent: koreanRequest,
  domain: "health",
  targetAudience: "50대",
  contentGoal: "안전한 아침 운동 루틴 안내",
  recommendedPrimaryKeyword: "50대 아침 운동 루틴",
  keywordCandidates: ["50대 아침 운동 루틴", "중년 아침 운동"],
  searchIntent: "informational",
  recommendedContentType: "guide",
  recommendedPlatforms: ["tistory", "youtube", "Naver Cafe"],
  suggestedTitleAngles: ["50대를 위한 아침 운동 루틴"],
  relatedKeywords: ["중년 건강 관리"],
  contentCluster: ["운동", "건강"],
  recommendationReason: "요청한 독자와 주제에 맞는 실용 가이드입니다.",
  confidence: 0.9,
  estimateDisclosure: "AI estimate",
};

function structuredArticle(title: string, prose: string) {
  return {
    title,
    metaDescription: "Complete canonical guide for readers.",
    primarySearchIntent: "canonical guide",
    secondaryIntent: "practical action",
    secondaryKeywords: [],
    relatedTerms: ["canonical"],
    tags: ["canonical", "guide", "practical", "reader", "content"],
    introduction: [prose],
    sections: Array.from({ length: 5 }, (_, index) => ({ heading: `Section ${index + 1}`, paragraphs: [prose, prose] })),
    conclusion: [prose],
    images: [],
    cta: [],
  };
}

describe("studio planning endpoint", () => {
  beforeEach(() => {
    const current: UserData = { workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } }, brands: [], projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }], contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: "Draft", body: "", status: "planning", primaryKeyword: "canonical", relatedKeywords: [], searchIntent: opportunity.searchIntent, opportunity, createdAt: "now", updatedAt: "now" }], qualityReports: [] };
    storeMocks.get.mockResolvedValue(current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => updater(current));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("preserves Korean input as UTF-8 and returns a planning result", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(planningResult),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "plan", input: { naturalLanguageRequest: koreanRequest, workspaceId: "workspace-1", projectId: "project-1" } }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan: { interpretedIntent: koreanRequest, recommendedPrimaryKeyword: "50대 아침 운동 루틴" },
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeInstanceOf(Uint8Array);
    expect(JSON.parse(new TextDecoder().decode(requestBody as Uint8Array)).input).toContain(koreanRequest);
  });

  it("persists the Planning request before the provider call and hydrates candidates into the same Content", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    let current: UserData = {
      workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
      brands: [], projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }], contents: [],
    };
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => {
      current = updater(current);
      return current;
    });
    const startResponse = await POST(new Request("http://localhost/api/studio", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start-planning", input: {
        naturalLanguageRequest: koreanRequest, workspaceId: "workspace-1", projectId: "project-1", contentId: "planning-content",
        operationId: "planning-operation-1", selectionMode: "automatic",
      } }),
    }));
    expect(startResponse.status).toBe(200);
    expect(current.contents[0]).toMatchObject({
      id: "planning-content", workspaceId: "workspace-1", projectId: "project-1",
      planningWorkflow: { status: "planning", operationId: "planning-operation-1", revision: 1 },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(planningResult) }), { status: 200 }));
    const planResponse = await POST(new Request("http://localhost/api/studio", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", input: {
        naturalLanguageRequest: koreanRequest, workspaceId: "workspace-1", projectId: "project-1", contentId: "planning-content",
        operationId: "planning-operation-1", selectionMode: "automatic",
      } }),
    }));
    expect(planResponse.status).toBe(200);
    expect(current.contents[0].planningWorkflow).toMatchObject({ status: "candidatesReady", revision: 2, selectedOpportunityId: expect.stringMatching(/^opportunity-/) });
    expect(current.contents[0].planning?.opportunityCandidates).toHaveLength(1);
    expect(current.contents[0].planning?.opportunityCandidates?.[0]).toMatchObject({ projectId: "project-1", fingerprint: expect.stringMatching(/^fp-/) });
  });

  it("keeps a user-specified topic when Evidence cannot verify Project alignment", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    const directRequest = "제주도 가족 여행 준비물 체크리스트를 작성해 줘";
    let current: UserData = {
      workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
      brands: [],
      projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Health", description: "혈압과 중년 건강 운동 콘텐츠", createdAt: "now", updatedAt: "now" }],
      contents: [],
    };
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => {
      current = updater(current);
      return current;
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({
      ...planningResult,
      interpretedIntent: directRequest,
      domain: "travel",
      targetAudience: "가족 여행자",
      contentGoal: "여행 준비물 안내",
      recommendedPrimaryKeyword: "제주도 가족 여행 준비물",
      keywordCandidates: ["제주도 가족 여행 준비물"],
      searchIntent: "제주도 가족 여행에 필요한 준비물을 확인하려는 정보 탐색",
      recommendedContentType: "checklist",
      suggestedTitleAngles: ["제주도 가족 여행 준비물 체크리스트"],
      relatedKeywords: ["제주도 여행 체크리스트"],
      contentCluster: ["제주도 여행"],
      recommendationReason: "사용자가 직접 지정한 주제를 실용적인 체크리스트로 구성합니다.",
    }) }), { status: 200 }));

    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "plan", input: { naturalLanguageRequest: directRequest, workspaceId: "workspace-1", projectId: "project-1", selectionMode: "userSpecified" } }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.opportunityCandidates).toHaveLength(1);
    expect(body.plan.opportunityCandidates[0]).toMatchObject({
      selectionMode: "userSpecified",
      recommendationType: "blogGrowth",
      marketEvidenceStatus: "unavailable",
    });
    expect(body.plan.opportunityCandidates[0].limitations).toContain("현재 Project 전략과의 연관성이 자동으로 확인되지 않았습니다. 사용자가 지정한 주제를 우선하여 계속 진행합니다.");
  });

  it("invokes the Planning Provider once for concurrent requests with the same operationId", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    let current: UserData = {
      workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
      brands: [], projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
      contents: [{ id: "planning-content", workspaceId: "workspace-1", projectId: "project-1", title: "Planning", body: "", status: "planning", createdAt: "now", updatedAt: "now", planningWorkflow: { status: "planning", request: koreanRequest, selectionMode: "automatic", operationId: "planning-operation-once", revision: 1, createdAt: "now", updatedAt: "now", lastSuccessfulStep: "request" } }],
    };
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => {
      current = updater(current);
      return current;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(planningResult) }), { status: 200 }));
    const request = () => POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", input: { naturalLanguageRequest: koreanRequest, workspaceId: "workspace-1", projectId: "project-1", contentId: "planning-content", operationId: "planning-operation-once", selectionMode: "automatic" } }) }));

    const [firstResponse, secondResponse] = await Promise.all([request(), request()]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(current.contents[0].planningWorkflow).toMatchObject({ status: "candidatesReady", revision: 2 });
  });

  it("uses the persisted confirmed Opportunity when same-identity request fields are stale", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    vi.stubEnv("OPENAI_REVIEW_TIMEOUT_MS", "5");
    const prose = "Generated complete body with concrete context, useful actions, examples, and a clear outcome for readers. ".repeat(20);
    const document = structuredArticle("Canonical guide", prose);
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(document) }), { status: 200 }))
      .mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }));

    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", input: {
        contentId: "content-1",
        contentType: "guide",
        opportunityId: opportunity.opportunityId,
        opportunityVersion: opportunity.version,
        opportunityFingerprint: opportunity.fingerprint,
        primaryKeyword: "stale keyword from a restored screen",
        topic: "stale topic from a restored screen",
        searchIntent: "stale intent from a restored screen",
        secondaryKeywords: ["stale secondary keyword"],
        keywords: ["stale keyword from a restored screen"],
        platform: "tistory",
        projectId: "project-1",
        workspaceId: "workspace-1",
      } }),
    }));
    const result = await response.json() as { aiReviewError?: string; document?: { id: string; title: string }; qualityTargetBlocked?: boolean; reachedTarget?: boolean; recoveryRevisionId?: string; data?: UserData };

    expect(response.status).toBe(200);
    expect(result.document).toBeUndefined();
    expect(result.qualityTargetBlocked).toBe(true);
    expect(result.reachedTarget).toBe(false);
    expect(result.recoveryRevisionId).toBeUndefined();
    expect(result.data?.contents[0].document).toBeUndefined();
    expect(result.data?.contents[0].primaryKeyword).toBe("canonical");
    expect(result.aiReviewError).toContain("timed out");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual(expect.objectContaining({ contents: [expect.objectContaining({ status: "draft", generationError: expect.stringContaining("최종 품질 검토") })] }));
    expect(vi.mocked(studioStore.update)).toHaveBeenCalledWith("application", "user-data", expect.any(Function));
  });

  it("uses one final quality-edit call and blocks editor completion when the result is still unapproved", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    const prose = "This complete article explains the reader problem, practical actions, examples, and a concrete conclusion in readable language. ".repeat(18);
    const draft = structuredArticle("Canonical guide", prose);
    const corrected = { title: "Canonical guide final", metaDescription: "Corrected final guide", primarySearchIntent: "informational guide", blocks: [
      { type: "paragraph", text: `Final edit applied. ${prose}` },
      ...Array.from({ length: 5 }, (_, index) => [{ type: "heading", level: 2, text: `Section ${index + 1}` }, { type: "paragraph", text: prose }]).flat(),
      { type: "paragraph", text: prose },
    ] };
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(draft) }), { status: 200 }))
      .mockImplementation(async () => new Response(JSON.stringify({ output_text: JSON.stringify(corrected) }), { status: 200 }));
    const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", input: { contentId: "content-1", contentType: "guide", opportunityId: opportunity.opportunityId, opportunityVersion: opportunity.version, opportunityFingerprint: opportunity.fingerprint, primaryKeyword: opportunity.primaryKeyword, topic: opportunity.selectedTopic, searchIntent: opportunity.searchIntent, secondaryKeywords: opportunity.secondaryKeywords, keywords: ["canonical"], platform: "tistory", projectId: "project-1", workspaceId: "workspace-1" } }) }));
    const result = await response.json() as { automaticImprovementCount?: number; document?: { title: string }; recoveryRevisionId?: string; qualityHistory?: unknown[]; reachedTarget?: boolean; qualityTargetBlocked?: boolean; data?: UserData };
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.automaticImprovementCount).toBe(0);
    expect(result.qualityHistory).toHaveLength(2);
    expect(result.document).toBeUndefined();
    expect(result.reachedTarget).toBe(false);
    expect(result.qualityTargetBlocked).toBe(true);
    expect(result.recoveryRevisionId).toBeUndefined();
    expect(result.data?.contents[0]).toMatchObject({ status: "draft" });
    expect(vi.mocked(studioStore.update)).toHaveBeenCalledWith("application", "user-data", expect.any(Function));
    const reviewBody = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[1]?.[1]?.body as Uint8Array));
    expect(reviewBody.input).toContain("second and final AI call");
    expect(reviewBody.input).toContain("overallScore >= 95");
    expect(reviewBody.input).toContain("readability >= 95");
    expect(reviewBody.input).not.toContain("4,800–5,200 non-whitespace prose characters");
    expect(reviewBody.input).not.toContain("12–18 paragraph blocks");
    expect(reviewBody.input).toContain("distinct editorial purpose and section context");
  });

  it("returns structured diagnostics and skips review after a generation gate failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    const invalid = structuredArticle("Canonical guide", "나".repeat(1_000));
    invalid.introduction = ["가".repeat(400)];
    invalid.conclusion = ["다".repeat(400)];
    invalid.sections[0] = { heading: "Too shallow", paragraphs: ["라".repeat(449)] };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify(invalid) }), { status: 200 }),
    );
    const response = await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", input: {
        contentId: "content-1",
        opportunityId: opportunity.opportunityId,
        opportunityVersion: opportunity.version,
        opportunityFingerprint: opportunity.fingerprint,
        primaryKeyword: opportunity.primaryKeyword,
        topic: opportunity.selectedTopic,
        searchIntent: opportunity.searchIntent,
        secondaryKeywords: opportunity.secondaryKeywords,
        keywords: ["canonical"],
        platform: "tistory",
        projectId: "project-1",
        workspaceId: "workspace-1",
        operationId: "",
      } }),
    }));
    const result = await response.json() as { diagnostic?: { code?: string; sections: Array<{ heading: string; proseCharacters: number }> } };
    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.diagnostic?.code).toBe("LONG_FORM_SHALLOW_SECTION");
    expect(result.diagnostic?.sections).toContainEqual({ heading: "Too shallow", proseCharacters: 449 });
  });

  it("restores the confirmed keyword when Final Review returns a title without it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
    const original = { id: "content-1", title: "장 건강 관리 방법: 기존 제목", blocks: [{ id: "p-1", type: "paragraph" as const, text: "장 건강 관리 방법을 설명하는 기존 본문입니다." }] };
    const current: UserData = {
      workspace: { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: [], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
      brands: [], projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
      contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: original.title, body: "", status: "in_review", primaryKeyword: "장 건강 관리 방법", relatedKeywords: ["만성 염증"], contentType: "article", document: original, updatedAt: "now" }],
      history: [], qualityReports: [],
    };
    storeMocks.get.mockResolvedValue(current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => updater(current));
    const prose = "장 건강을 관리하기 위한 식사와 수면, 활동 기준을 독자가 바로 적용할 수 있도록 구체적인 순서와 주의사항으로 설명합니다. ".repeat(18);
    const reviewedBlocks = [
      { type: "paragraph", text: prose },
      ...Array.from({ length: 5 }, (_, index) => [{ type: "heading", level: 2, text: `관리 기준 ${index + 1}` }, { type: "paragraph", text: prose }]).flat(),
      { type: "paragraph", text: prose },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ title: "만성 염증 관리 가이드", blocks: reviewedBlocks }) }), { status: 200 }));

    const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "final-review", input: { workspaceId: "workspace-1", contentId: "content-1" } }) }));
    const result = await response.json() as { document?: { title: string }; data?: UserData };

    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.document?.title).toContain("장 건강 관리 방법");
    expect(result.data?.contents[0].title).toBe(result.document?.title);
    expect(result.data?.contents[0].primaryKeyword).toBe("장 건강 관리 방법");
  });

  it("rejects a Project that is absent from the current Workspace instead of falling back to another Project", async () => {
    const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", input: { naturalLanguageRequest: "topic", workspaceId: "workspace-1", projectId: "missing-project" } }) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Project") });
  });

  it("does not accept a client-supplied Quality score through application persistence", async () => {
    const response = await PUT(new Request("http://localhost/api/studio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: { id: "workspace-1" }, brands: [], projects: [], contents: [{ id: "client-content", projectId: "project", title: "Draft", body: "", status: "draft", updatedAt: "now", quality: { overallScore: 100, approved: true, dimensions: [] } }], qualityReports: [{ contentId: "client-content", report: { overallScore: 100, approved: true } }] }) }));
    expect(response.status).toBe(200);
    expect(vi.mocked(studioStore.update)).toHaveBeenCalledWith("application", "user-data", expect.any(Function));
    const saved = await vi.mocked(studioStore.update).mock.results.at(-1)?.value as UserData;
    expect(saved.contents.find((content) => content.id === "client-content")).not.toHaveProperty("quality");
    expect(saved.qualityReports).toEqual([]);
  });
});
