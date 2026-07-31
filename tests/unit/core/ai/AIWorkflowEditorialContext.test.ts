import { describe, expect, it } from "vitest";

import type { AIProvider, AIRequest, AIResponse } from "../../../../core/ai";
import {
  AIWorkflow,
  withCanonicalEditorialContext,
  type ContentGenerationStrategy,
  type GenerationInput,
} from "../../../../core/ai/AIWorkflow";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
} from "../../../../core/content";

const approvalContext = [
  "Content purpose: adsense_approval",
  "Approval policy: adsense_approval_mode@1.0",
  "Approval profile: tistory_vivarain_art_v1@1.0",
].join("\n");

const input: GenerationInput = {
  contentId: "content-1",
  contentType: "article" as GenerationInput["contentType"],
  editorialContext: approvalContext,
  keywords: ["미술 감상"],
  platform: "tistory" as GenerationInput["platform"],
  projectId: "project-1",
};

class RecordingProvider implements AIProvider {
  request?: AIRequest;
  calls = 0;
  diagnostics?: AIResponse["diagnostics"];

  async generate(request: AIRequest) {
    this.calls += 1;
    this.request = request;
    return {
      content: "generated",
      model: "test",
      ...(this.diagnostics ? { diagnostics: this.diagnostics } : {}),
    };
  }
}

const strategy: ContentGenerationStrategy = {
  createRequest: () => ({ instruction: "Write the article." }),
  parse: () => ({
    id: "content-1",
    title: "Title",
    blocks: [],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: "2026-07-27T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 0,
    },
  }),
};

function opportunity(input: Readonly<{
  selectionMode: "automatic" | "userSpecified";
  sourceRequest: string;
  selectedTopic: string;
  primaryKeyword: string;
}>) {
  return confirmContentOpportunity(createContentOpportunityCandidate({
    sourceRequest: input.sourceRequest,
    selectionMode: input.selectionMode,
    selectedTopic: input.selectedTopic,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["생활비 통장"],
    searchIntent: "통장 구조와 계좌 역할을 결정",
    audience: "통장 구조를 단순화하려는 직장인",
    contentType: "article",
    contentAngle: "계좌 수보다 역할과 선택 기준",
    readerProblem: "필요한 계좌 수와 역할을 정하지 못함",
    expectedCoverage: ["계좌 역할", "자동이체 순서"],
    selectionRationale: "콘텐츠 공백 추론",
    opportunityEvidence: [{ source: "unknown", summary: "검색량 데이터 없음" }],
    confidence: 0.7,
    cautions: [],
    projectId: "project-1",
  }), {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    confirmedAt: "2026-07-31T00:00:00.000Z",
  });
}

const identityContext = JSON.stringify({
  projectStrategy: {
    projectIdentity: {
      projectName: "밝은재테크",
      brandName: "밝은재테크",
    },
  },
});

describe("AIWorkflow canonical editorial context", () => {
  it("appends server editorial context and snapshots it into the generated document", async () => {
    const provider = new RecordingProvider();
    const result = await new AIWorkflow(provider, strategy).generate(input);

    expect(provider.request?.instruction).toContain("Canonical server editorial context");
    expect(provider.request?.instruction).toContain("Approval policy: adsense_approval_mode@1.0");
    expect(provider.calls).toBe(1);
    expect(result.document.metadata?.approvalPolicy).toMatchObject({
      policyId: "adsense_approval_mode",
      policyVersion: "1.0",
      profileId: "tistory_vivarain_art_v1",
      profileVersion: "1.0",
    });
  });

  it("persists approval web-search results as unverified Evidence candidates", async () => {
    const provider = new RecordingProvider();
    provider.diagnostics = {
      requestTimeoutMs: 5_000,
      elapsedMs: 10,
      webSources: [{
        url: "https://www.nga.gov/artworks/1167-portrait-man",
        title: "Portrait of a Man",
        excerpt: "Official artwork record",
      }],
    };

    const result = await new AIWorkflow(provider, strategy).generate(input);

    expect(result.document.metadata?.approvalEvidence).toMatchObject({
      version: "1.0",
      status: "needs_review",
      sources: [{
        url: "https://www.nga.gov/artworks/1167-portrait-man",
        canonicalUrl: "https://www.nga.gov/artworks/1167-portrait-man",
        title: "Portrait of a Man",
        publisher: "nga.gov",
        sourceType: "official_archive",
        verified: false,
        selected: false,
      }],
    });
  });

  it("blocks an automatic Planning snapshot polluted by the Project identity before the provider call", async () => {
    const provider = new RecordingProvider();
    const contaminated = opportunity({
      selectionMode: "automatic",
      sourceRequest: "밝은재테크 프로젝트에서 아직 다루지 않은 생활경제 주제를 선정해줘",
      selectedTopic: "밝은재테크 통장 쪼개기 방법",
      primaryKeyword: "밝은재테크 통장 쪼개기",
    });

    await expect(new AIWorkflow(provider, strategy).generate({
      ...input,
      editorialContext: identityContext,
      contentOpportunity: contaminated,
      keywords: [contaminated.primaryKeyword, ...contaminated.secondaryKeywords],
    })).rejects.toThrow("프로젝트명 또는 브랜드명이 포함되어 AI 생성을 차단했습니다");
    expect(provider.calls).toBe(0);
  });

  it("blocks a model response that reinserts the Project identity into body, metadata, ALT, or tags", async () => {
    const provider = new RecordingProvider();
    const clean = opportunity({
      selectionMode: "automatic",
      sourceRequest: "생활경제 주제를 선정해줘",
      selectedTopic: "통장 쪼개기 방법",
      primaryKeyword: "통장 쪼개기 방법",
    });
    const contaminatedOutput: ContentGenerationStrategy = {
      createRequest: strategy.createRequest,
      parse: () => ({
        id: "content-1",
        title: "통장 쪼개기 방법",
        blocks: [
          { id: "p1", type: "paragraph", text: "밝은재테크 독자를 위한 통장 관리 안내입니다." },
          { id: "image", type: "image", source: "", alt: "밝은재테크 통장 관리 이미지" },
        ],
        metadata: {
          buttonCount: 0,
          createdAt: "2026-07-31T00:00:00.000Z",
          generator: "test",
          imageCount: 1,
          language: "ko",
          readingTime: 1,
          source: "ai",
          updatedAt: "2026-07-31T00:00:00.000Z",
          version: 1,
          videoCount: 0,
          wordCount: 10,
          metaDescription: "밝은재테크 통장 관리 방법",
          tags: ["밝은재테크", "통장관리"],
        },
      }),
    };

    await expect(new AIWorkflow(provider, contaminatedOutput).generate({
      ...input,
      editorialContext: identityContext,
      contentOpportunity: clean,
      keywords: [clean.primaryKeyword, ...clean.secondaryKeywords],
    })).rejects.toThrow("AI 생성 결과의 제목·본문·메타데이터·이미지 설명 또는 태그");
    expect(provider.calls).toBe(1);
  });

  it("keeps an owned identity when a user explicitly selected it as the search subject", async () => {
    const provider = new RecordingProvider();
    const requested = opportunity({
      selectionMode: "userSpecified",
      sourceRequest: "밝은재테크 통장 쪼개기 글을 작성해줘",
      selectedTopic: "밝은재테크 통장 쪼개기 방법",
      primaryKeyword: "밝은재테크 통장 쪼개기",
    });

    await new AIWorkflow(provider, strategy).generate({
      ...input,
      editorialContext: identityContext,
      contentOpportunity: requested,
      keywords: [requested.primaryKeyword, ...requested.secondaryKeywords],
    });
    expect(provider.calls).toBe(1);
  });

  it("does not duplicate context already included by a strategy", () => {
    const instruction = `Write the article.\n${approvalContext}`;

    expect(withCanonicalEditorialContext(instruction, approvalContext)).toBe(instruction);
  });

  it("keeps standard generation unchanged when no context exists", () => {
    expect(withCanonicalEditorialContext("Write the article.")).toBe("Write the article.");
  });
});