import { describe, expect, it } from "vitest";

import {
  assertConfirmedContentOpportunity,
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  detectContentOpportunitySelectionMode,
  hasCurrentContentOpportunityFingerprint,
} from "../../../../core/content";

const candidate = () => createContentOpportunityCandidate({
  sourceRequest: "기존 글과 겹치지 않는 건강 글을 골라줘",
  selectionMode: "automatic",
  selectedTopic: "장 건강 관리",
  primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["장 건강에 좋은 음식", "유산균", "식이섬유"],
  searchIntent: "장 건강을 개선하는 실천 방법 탐색",
  audience: "건강 관리에 관심 있는 일반 성인",
  contentType: "guide",
  contentAngle: "음식과 생활습관을 함께 설명",
  readerProblem: "장 건강을 어떻게 관리해야 하는지 모름",
  expectedCoverage: ["장내 환경", "유산균", "식이섬유", "생활습관"],
  selectionRationale: "프로젝트에서 아직 다루지 않은 콘텐츠 공백",
  opportunityEvidence: [{ source: "inferred", summary: "기존 콘텐츠 제목과 키워드의 공백을 추론" }],
  confidence: 0.82,
  cautions: ["외부 검색량 공급원 없음"],
  projectId: "project-1",
});

describe("Content Opportunity contract", () => {
  it("creates the same identity and fingerprint for the same planning input", () => {
    expect(candidate()).toEqual(candidate());
  });

  it("rebuilds a valid fingerprint after server classification fields and Evidence are attached", () => {
    const classified = createContentOpportunityCandidate({
      ...candidate(),
      recommendationType: "blogGrowth",
      evidenceIds: ["evidence-b", "evidence-a"],
      opportunityEvidence: [
        { source: "inferred", summary: "두 번째 근거", evidenceId: "evidence-b" },
        { source: "inferred", summary: "첫 번째 근거", evidenceId: "evidence-a" },
      ],
      marketEvidenceStatus: "unavailable",
      internalGrowthEvidenceStatus: "verified",
      freshness: "fresh",
      limitations: ["외부 검색 수요 미검증"],
      classificationVersion: 1,
    });
    expect(hasCurrentContentOpportunityFingerprint(classified)).toBe(true);
    expect(classified.fingerprint).not.toBe(candidate().fingerprint);
  });

  it("produces the same canonical fingerprint regardless of Evidence array order", () => {
    const evidence = [
      { source: "inferred" as const, summary: "첫 번째 근거", evidenceId: "evidence-a" },
      { source: "inferred" as const, summary: "두 번째 근거", evidenceId: "evidence-b" },
    ];
    const left = createContentOpportunityCandidate({ ...candidate(), opportunityEvidence: evidence, evidenceIds: ["evidence-b", "evidence-a"] });
    const right = createContentOpportunityCandidate({ ...candidate(), opportunityEvidence: [...evidence].reverse(), evidenceIds: ["evidence-a", "evidence-b"] });
    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.opportunityId).toBe(right.opportunityId);
  });

  it("binds the complete opportunity to one Workspace, Project, and Content", () => {
    const confirmed = confirmContentOpportunity(candidate(), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-18T00:00:00.000Z" });
    expect(assertConfirmedContentOpportunity(confirmed, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1",
      opportunityId: confirmed.opportunityId, opportunityVersion: confirmed.version, opportunityFingerprint: confirmed.fingerprint,
      primaryKeyword: confirmed.primaryKeyword, selectedTopic: confirmed.selectedTopic, searchIntent: confirmed.searchIntent, secondaryKeywords: confirmed.secondaryKeywords,
    })).toBe(confirmed);
  });

  it("rejects stale or cross-content opportunity bindings", () => {
    const confirmed = confirmContentOpportunity(candidate(), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-18T00:00:00.000Z" });
    expect(() => assertConfirmedContentOpportunity(confirmed, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-2",
      opportunityId: confirmed.opportunityId, opportunityVersion: confirmed.version, opportunityFingerprint: confirmed.fingerprint,
      primaryKeyword: confirmed.primaryKeyword, selectedTopic: confirmed.selectedTopic, searchIntent: confirmed.searchIntent, secondaryKeywords: confirmed.secondaryKeywords,
    })).toThrow("현재 원고와 일치하지 않습니다");
  });

  it("does not allow a user-specified topic to be paired with another search intent", () => {
    expect(() => createContentOpportunityCandidate({ ...candidate(), selectionMode: "userSpecified", selectedTopic: "만성 염증 관리", primaryKeyword: "장 건강 관리 방법" }))
      .toThrow("같은 검색 의도");
  });

  it("distinguishes delegated topic selection from an explicit topic", () => {
    expect(detectContentOpportunitySelectionMode("기존에 작성하지 않은 주제를 AI가 골라줘")).toBe("automatic");
    expect(detectContentOpportunitySelectionMode("만성 염증 관리 글을 작성해 줘")).toBe("userSpecified");
  });
});
