import { describe, expect, it } from "vitest";

import { assertCandidateDocumentOwnedIdentityClean } from "../../../../app/application/ContentIdentityDocumentGuard";
import { confirmContentOpportunity, createContentOpportunityCandidate, type ContentDocument } from "../../../../core/content";
import type { UserData } from "../../../../app/user-flow/user-data";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "통장 쪼개기 방법을 작성해줘",
  selectionMode: "userSpecified",
  selectedTopic: "통장 쪼개기 방법",
  primaryKeyword: "통장 쪼개기 방법",
  secondaryKeywords: ["생활비 통장"],
  searchIntent: "계좌 역할 결정",
  audience: "직장인",
  contentType: "article",
  contentAngle: "계좌 역할과 선택 기준",
  readerProblem: "계좌 역할을 정하지 못함",
  expectedCoverage: ["계좌 역할"],
  selectionRationale: "사용자 지정",
  opportunityEvidence: [{ source: "unknown", summary: "검색량 미검증" }],
  confidence: 0.7,
  cautions: [],
  projectId: "project-1",
}), {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  confirmedAt: "2026-07-31T00:00:00.000Z",
});

const cleanDocument: ContentDocument = {
  id: "document-1",
  title: "통장 쪼개기 방법",
  blocks: [{ id: "p1", type: "paragraph", text: "계좌 역할을 구분하는 방법을 설명합니다." }],
  metadata: {
    buttonCount: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 1,
    source: "test",
    updatedAt: "2026-07-31T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 10,
    tags: ["통장관리"],
  },
};

const data: UserData = {
  workspace: { id: "workspace-1", name: "Studio" },
  brands: [{ id: "brand-1", workspaceId: "workspace-1", name: "밝은재테크" }],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    brandId: "brand-1",
    name: "밝은재테크",
    description: "생활경제",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    brandId: "brand-1",
    title: cleanDocument.title,
    body: "",
    status: "in_review",
    updatedAt: "2026-07-31T00:00:00.000Z",
    primaryKeyword: opportunity.primaryKeyword,
    relatedKeywords: opportunity.secondaryKeywords,
    opportunity,
    document: cleanDocument,
  }],
};

describe("candidate document owned identity guard", () => {
  it("allows a clean candidate", () => {
    expect(() => assertCandidateDocumentOwnedIdentityClean(
      data,
      data.contents[0]!,
      cleanDocument,
    )).not.toThrow();
  });

  it("blocks a review candidate that reinserts the Project identity", () => {
    const contaminated: ContentDocument = {
      ...cleanDocument,
      blocks: [{ id: "p1", type: "paragraph", text: "밝은재테크 독자를 위한 계좌 안내입니다." }],
      metadata: {
        ...cleanDocument.metadata!,
        metaDescription: "밝은재테크 통장 관리 방법",
        tags: ["밝은재테크", "통장관리"],
      },
    };

    expect(() => assertCandidateDocumentOwnedIdentityClean(
      data,
      data.contents[0]!,
      contaminated,
    )).toThrow("후보 문서의 제목·본문·메타데이터·이미지 설명 또는 태그");
  });
});
