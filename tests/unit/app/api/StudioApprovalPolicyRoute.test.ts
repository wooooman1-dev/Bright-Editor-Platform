import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: storeMocks }));

import { POST } from "../../../../app/api/studio/route";
import type { UserData } from "../../../../app/user-flow/user-data";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ContentDocument,
} from "../../../../core/content";
import { resolveApprovalPolicySnapshot } from "../../../../core/approval";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "고흐 별이 빛나는 밤 감상",
  selectionMode: "userSpecified",
  selectedTopic: "고흐 별이 빛나는 밤 감상 가이드",
  primaryKeyword: "별이 빛나는 밤 감상",
  secondaryKeywords: ["빈센트 반 고흐"],
  searchIntent: "작품의 시각적 특징과 감상 포인트를 이해한다",
  audience: "미술 초보",
  contentType: "article",
  contentAngle: "공식 작품 정보와 관찰 순서를 연결한다",
  readerProblem: "작품에서 무엇을 봐야 하는지 모른다",
  expectedCoverage: ["공식 소장처", "시각적 특징", "감상 포인트"],
  selectionRationale: "사용자가 지정한 작품을 설명한다",
  opportunityEvidence: [{ source: "unknown", summary: "외부 시장 데이터 없음" }],
  confidence: 0.8,
  cautions: [],
  projectId: "project-1",
}), {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  confirmedAt: "2026-07-27T00:00:00.000Z",
});

function approvalContent(overrides: Partial<UserData["contents"][number]> = {}) {
  return {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: opportunity.selectedTopic,
    body: "",
    status: "planning",
    primaryKeyword: opportunity.primaryKeyword,
    relatedKeywords: opportunity.secondaryKeywords,
    searchIntent: opportunity.searchIntent,
    contentType: opportunity.contentType,
    opportunity,
    contentPurpose: "adsense_approval",
    approvalPolicyId: "adsense_approval_mode",
    approvalPolicyVersion: "1.0",
    approvalProfileId: "tistory_vivarain_art_v1",
    approvalProfileVersion: "1.0",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  } as UserData["contents"][number];
}

function data(content: UserData["contents"][number]): UserData {
  return {
    workspace: {
      id: "workspace-1",
      name: "Studio",
      settings: {
        enabledPlatforms: ["tistory"],
        publishing: {
          reviewFirst: true,
          draftOnly: true,
          publicPublish: false,
          sequentialDraftSave: true,
          qualityApprovalRequired: true,
        },
        appearance: { theme: "system" },
      },
    },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "현재는 일반 모드인 Project",
      description: "Project 설정은 Content snapshot 뒤에 변경됨",
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T01:00:00.000Z",
    }],
    contents: [content],
    qualityReports: [],
  };
}

function requestInput(fetchSpy: ReturnType<typeof vi.spyOn>, callIndex = 0): string {
  const body = fetchSpy.mock.calls[callIndex]?.[1]?.body;
  expect(body).toBeInstanceOf(Uint8Array);
  return JSON.parse(new TextDecoder().decode(body as Uint8Array)).input as string;
}

describe("studio approval policy routes", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-ascii-key");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the Planning Content snapshot after the Project default changes", async () => {
    let current = data(approvalContent({
      planningWorkflow: {
        status: "planning",
        request: "고흐 별이 빛나는 밤 감상",
        selectionMode: "userSpecified",
        operationId: "planning-operation-1",
        revision: 1,
        createdAt: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-27T00:00:00.000Z",
        lastSuccessfulStep: "request",
      },
    }));
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (_collection: string, _id: string, updater: (value: UserData | undefined) => UserData) => {
      current = updater(current);
      return current;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 }),
    );

    await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "plan", input: {
        naturalLanguageRequest: "고흐 별이 빛나는 밤 감상",
        workspaceId: "workspace-1",
        projectId: "project-1",
        contentId: "content-1",
        operationId: "planning-operation-1",
        selectionMode: "userSpecified",
      } }),
    }));

    expect(requestInput(fetchSpy)).toContain("Approval profile: Tistory · 비바레인 미술@1.0");
    expect(requestInput(fetchSpy)).not.toContain("tistory_vivarain_art_v1");
  });

  it("uses the confirmed Content snapshot for Generation", async () => {
    const officialUrl = "https://www.moma.org/collection/works/79802";
    const evidenceExcerpt = "The Starry Night was painted by Vincent van Gogh in 1889 and is in the collection of The Museum of Modern Art.";
    const current = data(approvalContent({ status: "in_review" }));
    storeMocks.get.mockResolvedValue(current);
    storeMocks.update.mockImplementation(async (_collection: string, _id: string, updater: (value: UserData | undefined) => UserData) => updater(current));
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "response-preflight",
        model: "gpt-5.6-terra",
        status: "completed",
        output_text: JSON.stringify({
          sources: [{ url: officialUrl, title: "The Starry Night | MoMA", evidenceExcerpt }],
        }),
        output: [{
          type: "web_search_call",
          action: { sources: [{ type: "url", url: officialUrl, title: "The Starry Night | MoMA" }] },
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        `<html><head><title>The Starry Night | MoMA</title><meta property="og:site_name" content="The Museum of Modern Art"></head><body>${`${evidenceExcerpt} Official collection record and artwork details. `.repeat(6)}</body></html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 }));

    await POST(new Request("http://localhost/api/studio", {
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
        keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
        platform: "tistory",
        projectId: "project-1",
        workspaceId: "workspace-1",
      } }),
    }));

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(requestInput(fetchSpy, 2)).toContain("Approval profile: Tistory · 비바레인 미술@1.0");
    expect(requestInput(fetchSpy, 2)).not.toContain("tistory_vivarain_art_v1");
    expect(requestInput(fetchSpy, 2)).toContain("Approval source preflight bundle");
    expect(requestInput(fetchSpy, 2)).toContain(officialUrl);
  });

  it("keeps the stable profile ID out of a canonical revision prompt", async () => {
    const document: ContentDocument = {
      id: "content-1",
      title: "별이 빛나는 밤 감상 가이드",
      blocks: [{ id: "p1", type: "paragraph", text: "작품의 구도와 색을 확인합니다." }],
      metadata: {
        buttonCount: 0,
        createdAt: "2026-07-27T00:00:00.000Z",
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "2026-07-27T00:00:00.000Z",
        version: 1,
        videoCount: 0,
        wordCount: 20,
        approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!,
      },
    };
    const current = data(approvalContent({ document, status: "in_review" }));
    storeMocks.get.mockResolvedValue(current);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 }),
    );

    await POST(new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revise", input: {
        workspaceId: "workspace-1",
        projectId: "project-1",
        contentId: "content-1",
        instruction: "문장을 다듬어줘",
        document,
      } }),
    }));

    expect(requestInput(fetchSpy)).toContain("Approval profile: Tistory · 비바레인 미술@1.0");
    expect(requestInput(fetchSpy)).not.toContain("tistory_vivarain_art_v1");
  });
});
