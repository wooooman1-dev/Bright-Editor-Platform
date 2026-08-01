import { describe, expect, it } from "vitest";

import { parsePlanningResult } from "../../../../app/application/ContentPlanningStrategy";
import { contentBoundEditorialContext } from "../../../../app/application/approval/ApprovalContentPolicy";
import type { UserContent } from "../../../../app/user-flow/user-data";
import { assertOwnedIdentityKeywordPolicy } from "../../../../core/ai";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  findUnrequestedOwnedIdentityPrefixes,
} from "../../../../core/content";

const automaticOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "오늘의 생활경제 주제를 골라줘",
  selectionMode: "automatic",
  selectedTopic: "통장 역할을 정하는 방법",
  primaryKeyword: "밝은재테크",
  secondaryKeywords: ["생활비 통장"],
  searchIntent: "통장 역할과 자동이체 순서를 결정",
  audience: "직장인",
  contentType: "article",
  contentAngle: "계좌 수보다 역할과 선택 기준",
  readerProblem: "계좌 역할을 정하지 못함",
  expectedCoverage: ["계좌 역할", "자동이체 순서"],
  selectionRationale: "자동 Planning 후보",
  opportunityEvidence: [{ source: "unknown", summary: "검색량 미검증" }],
  confidence: 0.7,
  cautions: [],
  projectId: "project-1",
}), {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  confirmedAt: "2026-08-01T00:00:00.000Z",
});

const editorialContext = JSON.stringify({
  projectStrategy: {
    projectIdentity: {
      projectName: "밝은재테크",
      brandName: "밝은재테크",
    },
  },
  ownedIdentityPolicy: {
    sourceRequest: automaticOpportunity.sourceRequest,
    selectionMode: automaticOpportunity.selectionMode,
  },
});

describe("owned identity Generation boundary", () => {
  it("treats an exact Project identity value as contaminated Planning data", () => {
    expect(findUnrequestedOwnedIdentityPrefixes({
      ownedTerms: ["밝은재테크"],
      sourceRequest: automaticOpportunity.sourceRequest,
      selectionMode: automaticOpportunity.selectionMode,
      values: ["밝은재테크"],
    })).toEqual(["밝은재테크"]);
  });

  it("rejects a Planning candidate whose primary keyword is exactly the Project identity", () => {
    const response = JSON.stringify({
      interpretedIntent: "생활경제 주제 선정",
      domain: "생활경제",
      targetAudience: "직장인",
      contentGoal: "통장 역할과 선택 기준 안내",
      recommendedPlatforms: ["wordpress"],
      suggestedTitleAngles: ["통장 역할을 정하는 방법"],
      contentCluster: ["계좌 역할", "자동이체 순서"],
      recommendationReason: "자동 Planning 후보",
      confidence: 0.7,
      estimateDisclosure: "AI estimate",
      opportunityCandidates: [{
        selectedTopic: "통장 역할을 정하는 방법",
        primaryKeyword: "밝은재테크",
        secondaryKeywords: ["생활비 통장"],
        searchIntent: "통장 역할과 자동이체 순서를 결정",
        audience: "직장인",
        contentType: "article",
        contentAngle: "계좌 수보다 역할과 선택 기준",
        readerProblem: "계좌 역할을 정하지 못함",
        expectedCoverage: ["계좌 역할", "자동이체 순서"],
        selectionRationale: "자동 Planning 후보",
        opportunityEvidence: [{ source: "unknown", summary: "검색량 미검증" }],
        confidence: 0.7,
        cautions: [],
      }],
    });

    expect(() => parsePlanningResult(response, {
      projectId: "project-1",
      selectionMode: "automatic",
      sourceRequest: "오늘의 생활경제 주제를 골라줘",
      ownedBrandTerms: ["밝은재테크"],
    })).toThrow("AI planning response is missing a complete Content Opportunity");
  });

  it("blocks Generation before the Provider when the confirmed keyword is exactly the Project identity", () => {
    expect(() => assertOwnedIdentityKeywordPolicy({
      contentId: "content-1",
      contentType: "article" as never,
      contentOpportunity: automaticOpportunity,
      editorialContext,
      keywords: [automaticOpportunity.primaryKeyword, ...automaticOpportunity.secondaryKeywords],
      platform: "wordpress" as never,
      projectId: "project-1",
      structuredLongFormOutput: true,
    })).toThrow("새 Content에서 Planning을 다시 실행해 주세요");
  });

  it("places an explicit no-editorial-use rule beside the immutable identity context", () => {
    const content = {
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: automaticOpportunity.selectedTopic,
      body: "",
      status: "planning",
      updatedAt: "2026-08-01T00:00:00.000Z",
      naturalLanguageRequest: automaticOpportunity.sourceRequest,
      opportunity: automaticOpportunity,
    } as UserContent;

    const context = JSON.parse(contentBoundEditorialContext({
      projectIdentity: {
        projectName: "밝은재테크",
        brandName: "밝은재테크",
      },
    }, content)) as {
      ownedIdentityPolicy: {
        editorialRule: string;
      };
    };

    expect(context.ownedIdentityPolicy.editorialRule).toContain("metadata only");
    expect(context.ownedIdentityPolicy.editorialRule).toContain("title, body, metadata, image ALT or prompt, tags, or CTA labels");
  });
});
