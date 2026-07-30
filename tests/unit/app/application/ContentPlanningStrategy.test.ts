import { describe, expect, it, vi } from "vitest";

import { ContentPlanningStrategy, createManualPlanningResult, filterPlanningPlatforms, normalizePlanningPrimaryKeyword, parsePlanningResult, projectStrategyAIContext } from "../../../../app/application/ContentPlanningStrategy";

const result = { interpretedIntent: "혈당 관리 글", domain: "health", targetAudience: "50대", contentGoal: "실천 안내", recommendedPrimaryKeyword: "50대 혈당 관리", keywordCandidates: ["50대 혈당 관리", "식후 걷기"], searchIntent: "informational", recommendedContentType: "guide", recommendedPlatforms: ["tistory"], suggestedTitleAngles: ["50대 혈당 관리 가이드"], relatedKeywords: ["식후 혈당"], contentCluster: ["운동", "식단"], recommendationReason: "요청과 독자에 적합", confidence: 0.86, estimateDisclosure: "AI estimate" };

describe("natural-language content planning", () => {
  it("projects only current AI strategy fields without mutating legacy stored data", () => {
    const strategy = {
      primaryTopic: "건강정보",
      subtopics: ["검사 해석"],
      excludedTopics: ["치료 단정"],
      defaultContentType: "심층 건강 가이드",
      defaultPlatform: "tistory",
      targetLength: "4,500~6,000자",
      targetAudience: "건강검진 결과를 받은 일반 성인",
      tone: "친절하고 신뢰할 수 있는 설명",
      internalLinkPolicy: "검증된 공개 글만 사용",
      relatedPostPolicy: "관련 글 최대 3개",
      ctaPolicy: "필요한 경우만 사용",
      imageStrategy: "설명 목적 이미지",
      seoPolicy: "Helpful · Reliable · People-first",
      defaultPublishingAccountId: "connection-secret-boundary",
      defaultTistoryCategory: { publishingAccountId: "connection-secret-boundary", id: "1038988", name: "건강정보" },
    } as const;
    const before = JSON.stringify(strategy);
    const context = projectStrategyAIContext(strategy);
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("targetLength");
    expect(serialized).not.toContain("4,500~6,000자");
    expect(serialized).not.toContain("defaultPublishingAccountId");
    expect(serialized).not.toContain("publishingAccountId");
    expect(context).toMatchObject({
      primaryTopic: "건강정보",
      targetAudience: "건강검진 결과를 받은 일반 성인",
      tone: "친절하고 신뢰할 수 있는 설명",
      seoPolicy: "Helpful · Reliable · People-first",
      category: { id: "1038988", name: "건강정보" },
    });
    expect(JSON.stringify(strategy)).toBe(before);
    expect(strategy.targetLength).toBe("4,500~6,000자");
  });

  it("uses exactly one provider request and returns structured recommendations", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify(result), model: "test" }) };
    const plan = await new ContentPlanningStrategy(provider).analyze("50대를 위한 혈당 관리 글을 만들고 싶어");
    expect(provider.generate).toHaveBeenCalledOnce();
    const instruction = provider.generate.mock.calls[0]?.[0].instruction as string;
    expect(instruction).toContain("contentDepth must be standard, deep, or comparison; never return quick");
    expect(instruction).toContain("requiredContentElements");
    expect(instruction).toContain("preserve all of the keyword's core concepts");
    expect(instruction).toContain("not only a classification label");
    expect(instruction).toContain("missing/mentioned/sufficient");
    expect(instruction).toContain("Project-owned labels that are identity, not default search keywords");
    expect(instruction).not.toContain("targetLengthRange");
    expect(plan.recommendedPrimaryKeyword).toBe("50대 혈당 관리 가이드");
    expect(plan.estimateDisclosure).toContain("not measured");
  });

  it("removes unrequested project branding and preserves the concrete search task", () => {
    const plan = parsePlanningResult(JSON.stringify({
      ...result,
      interpretedIntent: "통장 쪼개기 방법 안내",
      domain: "생활경제",
      targetAudience: "통장 구조를 단순화하려는 직장인",
      contentGoal: "생활패턴에 맞는 계좌 역할과 선택 기준 안내",
      suggestedTitleAngles: ["밝은재테크 통장 쪼개기 방법"],
      opportunityCandidates: [{
        selectedTopic: "밝은재테크 통장 쪼개기 방법",
        primaryKeyword: "밝은재테크 통장 쪼개기",
        secondaryKeywords: ["목적별 통장", "생활비 통장"],
        searchIntent: "자신의 소비 구조에 맞는 통장 쪼개기 방법과 계좌 역할을 결정",
        audience: "통장 구조를 단순화하려는 직장인",
        contentType: "guide",
        contentAngle: "계좌 수보다 생활패턴별 역할과 선택 기준",
        readerProblem: "필요한 계좌 수와 역할을 정하지 못함",
        expectedCoverage: ["계좌 역할", "선택 기준", "자동이체 순서"],
        selectionRationale: "콘텐츠 공백 추론",
        opportunityEvidence: [{ source: "inferred", summary: "현재 Project 안에서 중복이 적음" }],
        confidence: 0.7,
        cautions: ["외부 검색량 미검증"],
      }],
    }), {
      projectId: "project-1",
      selectionMode: "automatic",
      sourceRequest: "오늘의 생활경제 글을 골라줘",
      projectContext: JSON.stringify({
        projectStrategy: {
          projectIdentity: { projectName: "밝은재테크", brandName: "밝은재테크" },
        },
      }),
    });

    expect(plan.recommendedPrimaryKeyword).toBe("통장 쪼개기 방법");
    expect(plan.suggestedTitleAngles[0]).toBe("통장 쪼개기 방법");
    expect(plan.opportunityCandidates?.[0]).toMatchObject({
      selectedTopic: "통장 쪼개기 방법",
      primaryKeyword: "통장 쪼개기 방법",
    });
  });

  it("keeps explicitly requested or third-party brand terms", () => {
    expect(normalizePlanningPrimaryKeyword(
      "밝은재테크 통장 쪼개기",
      "밝은재테크 통장 쪼개기 방법",
      "밝은재테크 통장 쪼개기 글을 작성해줘",
      ["밝은재테크"],
    )).toBe("밝은재테크 통장 쪼개기 방법");
    expect(normalizePlanningPrimaryKeyword(
      "카카오뱅크 통장 쪼개기",
      "카카오뱅크 통장 쪼개기 방법",
      "오늘의 생활경제 글을 골라줘",
      ["밝은재테크"],
    )).toBe("카카오뱅크 통장 쪼개기 방법");
  });

  it("supports a manual fallback without fabricated metrics", () => {
    const plan = createManualPlanningResult("테슬라 실적을 분석하는 블로그 글");
    expect(plan.confidence).toBe(0);
    expect(plan.estimateDisclosure).not.toMatch(/\b\d+\s*(?:searches|CPC)/i);
  });
  it("rejects incomplete provider output", () => expect(() => parsePlanningResult("{}")).toThrow("missing"));
  it("filters AI platform recommendations to the Workspace enabled list", () => {
    const plan = filterPlanningPlatforms({ ...result, recommendedPlatforms: ["tistory", "YouTube", "Naver Cafe"] }, ["tistory", "wordpress"]);
    expect(plan.recommendedPlatforms).toEqual(["tistory"]);
  });
  it("returns complete atomic opportunity candidates in automatic mode", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      ...result,
      opportunityCandidates: [
        { selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법", secondaryKeywords: ["유산균", "식이섬유"], searchIntent: "장 건강 개선 방법 탐색", audience: "일반 성인", contentType: "guide", contentAngle: "음식과 생활습관", readerProblem: "관리 기준 부족", expectedCoverage: ["장내 환경", "유산균"], selectionRationale: "콘텐츠 공백 추론", opportunityEvidence: [{ source: "inferred", summary: "기존 글과 중복이 적음" }], confidence: 0.8, cautions: ["검색량 실측값 없음"] },
        { selectedTopic: "만성 염증 관리", primaryKeyword: "만성 염증 관리 방법", secondaryKeywords: ["CRP", "항염 식단"], searchIntent: "만성 염증 관리 탐색", audience: "일반 성인", contentType: "guide", contentAngle: "검사와 생활습관", readerProblem: "염증 관리 기준 부족", expectedCoverage: ["CRP", "항염 식단"], selectionRationale: "콘텐츠 클러스터 확장", opportunityEvidence: [{ source: "estimated", summary: "AI가 기회를 추정" }], confidence: 0.7, cautions: ["검색량 실측값 없음"] },
      ],
    }), model: "test" }) };
    const plan = await new ContentPlanningStrategy(provider).analyze("아직 작성하지 않은 건강 주제를 골라줘", ["tistory"], { projectId: "project-1", selectionMode: "automatic" });
    expect(plan.opportunityCandidates).toHaveLength(2);
    expect(plan.qualityTarget?.contentDepth).toBe("deep");
    expect(plan.opportunityCandidates?.[0].qualityTarget).not.toHaveProperty("targetLengthRange");
    expect(plan.opportunityCandidates?.[0].qualityTarget.requiredContentElements).not.toHaveLength(0);
    expect(plan.opportunityCandidates?.[1]).toMatchObject({ selectedTopic: "만성 염증 관리", primaryKeyword: "만성 염증 관리 방법", searchIntent: "만성 염증 관리 탐색", secondaryKeywords: ["CRP", "항염 식단"] });
    expect(plan.selectionMode).toBe("automatic");
    expect(provider.generate).toHaveBeenCalledOnce();
  });
  it("does not expose fabricated search-volume claims as verified data", () => {
    const plan = parsePlanningResult(JSON.stringify({ ...result, recommendationReason: "월간 12,000회 검색되고 검색량이 높다", opportunityCandidates: [{ selectedTopic: "혈당 관리", primaryKeyword: "혈당 관리 방법", secondaryKeywords: [], searchIntent: "혈당 관리 방법 탐색", audience: "성인", contentType: "guide", contentAngle: "실천 안내", readerProblem: "관리 기준 부족", expectedCoverage: [], selectionRationale: "검색 데이터 기반이며 경쟁도가 낮다", opportunityEvidence: [{ source: "verified", summary: "많이 검색됩니다" }], confidence: 0.7, cautions: [] }] }), { projectId: "project-1", selectionMode: "automatic", hasVerifiedKeywordData: false, sourceRequest: "혈당 주제를 골라줘" });
    expect(plan.recommendationReason).not.toContain("12,000");
    expect(plan.opportunityCandidates?.[0].opportunityEvidence[0].source).toBe("estimated");
    expect(plan.opportunityCandidates?.[0].selectionRationale).toContain("AI 분석 기반");
    expect(plan.opportunityCandidates?.[0].selectionRationale).not.toContain("경쟁도가 낮다");
  });
  it("ignores AI-supplied binding, identity, classification, Evidence IDs, and fingerprint", () => {
    const plan = parsePlanningResult(JSON.stringify({
      ...result,
      opportunityCandidates: [{
        selectedTopic: "혈당 관리", primaryKeyword: "혈당 관리 방법", secondaryKeywords: [" 식후 걷기 ", "식후 걷기"],
        searchIntent: "혈당 관리 방법 탐색", audience: "성인", contentType: "guide", contentAngle: "실천 안내",
        readerProblem: "관리 기준 부족", expectedCoverage: ["식단"], selectionRationale: "콘텐츠 공백",
        opportunityEvidence: [{ source: "inferred", summary: "내부 추론" }], confidence: 0.7, cautions: [],
        workspaceId: "workspace-forged", projectId: "project-forged", contentId: "content-forged",
        opportunityId: "opportunity-forged", recommendationType: "comprehensive", evidenceIds: ["evidence-forged"], fingerprint: "fp-forged",
      }],
    }), { projectId: "project-server", selectionMode: "automatic", sourceRequest: "혈당 주제를 골라줘" });
    expect(plan.opportunityCandidates?.[0]).toMatchObject({ projectId: "project-server", secondaryKeywords: ["식후 걷기"] });
    expect(plan.opportunityCandidates?.[0]).not.toMatchObject({ opportunityId: "opportunity-forged", fingerprint: "fp-forged", recommendationType: "comprehensive", evidenceIds: ["evidence-forged"] });
  });
  it("rejects an adjacent opportunity that replaces a user-specified topic", () => {
    const mixed = { ...result, opportunityCandidates: [{ selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법", secondaryKeywords: ["유산균"], searchIntent: "장 건강 개선 탐색", audience: "성인", contentType: "guide", contentAngle: "장 건강 실천", readerProblem: "장 건강 기준 부족", expectedCoverage: ["유산균"], selectionRationale: "AI 추정", opportunityEvidence: [{ source: "estimated", summary: "AI 추정" }], confidence: 0.7, cautions: [] }] };
    expect(() => parsePlanningResult(JSON.stringify(mixed), { projectId: "project-1", selectionMode: "userSpecified", sourceRequest: "만성 염증 관리 글을 작성해 줘" }))
      .toThrow("complete Content Opportunity");
  });

});
