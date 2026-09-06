import { describe, expect, it, vi } from "vitest";

import { ContentPlanningStrategy, createManualPlanningResult, filterPlanningPlatforms, normalizePlanningPrimaryKeyword, parsePlanningResult, projectStrategyAIContext } from "../../../../app/application/ContentPlanningStrategy";
import { createOpportunityEvidence } from "../../../../core/intelligence";

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

  it("separates the WordPress brand, content domain, Category, and stable profile ID in Planning context", () => {
    const context = projectStrategyAIContext({
      primaryTopic: "밝은재테크",
      subtopics: ["생활경제·생활금융 콘텐츠 운영"],
      excludedTopics: [],
      defaultContentType: "Google SEO 정보 콘텐츠",
      defaultPlatform: "wordpress",
      targetAudience: "생활경제 정보를 찾는 일반 독자",
      tone: "친절하고 신뢰할 수 있는 설명",
      internalLinkPolicy: "검증된 공개 글만 사용",
      relatedPostPolicy: "관련 글 최대 3개",
      ctaPolicy: "필요한 경우만 사용",
      imageStrategy: "설명 목적 이미지",
      seoPolicy: "Helpful · Reliable · People-first",
      defaultContentPurpose: "adsense_approval",
      approvalProfileId: "wordpress_life_economy_v1",
    } as Parameters<typeof projectStrategyAIContext>[0] & {
      defaultContentPurpose: "adsense_approval";
      approvalProfileId: "wordpress_life_economy_v1";
    });
    const serialized = JSON.stringify(context);

    expect(serialized).toContain("Approval profile: WordPress · 밝은재테크@1.0");
    expect(serialized).toContain("Site and brand identity (metadata only): 밝은재테크");
    expect(serialized).toContain("Content domain: 생활경제, 생활금융, 정부지원, 세금, 주거 정보");
    expect(serialized).toContain("Required publishing categories: 생활재테크");
    expect(serialized).not.toContain("wordpress_life_economy_v1");
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
    expect(instruction).toContain("Topic-selection policy: prefer a specific reader problem");
    expect(instruction).toContain("Do not choose a topic merely because search volume, trend, scarcity, or low competition appears attractive");
    expect(instruction).toContain("Prefer claims that can be defended with the existing VERIFY/CRITICAL policy");
    expect(instruction).not.toContain("targetLengthRange");
    expect(plan.recommendedPrimaryKeyword).toBe("50대 혈당 관리 가이드");
    expect(plan.estimateDisclosure).toContain("not measured");
  });

  it("tells automatic topic selection to prefer topics that can produce a CRITICAL Claim", async () => {
    // 2026-09-04 실측: 기획 후보 222개 중 141개(63%)가 CRITICAL Claim 0개로
    // 끝나 공식 출처가 안 붙었다. "factual defensibility"라는 말만으로는 안
    // 걸러졌으니, 무엇을 걸러야 하는지 구체적으로 지시한다.
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify(result), model: "test" }) };
    await new ContentPlanningStrategy(provider).analyze("아직 작성하지 않은 생활경제 주제를 AI가 골라줘", undefined, { projectId: "project-1", selectionMode: "automatic" });
    const instruction = provider.generate.mock.calls[0]?.[0].instruction as string;
    expect(instruction).toContain("at least one specific eligibility rule, deadline, amount, or rate");
    expect(instruction).toContain("63% of past automatic candidates (141 of 222) produced zero CRITICAL Claims");
  });

  it("passes GSC site performance and NAVER relative trend Evidence to the single Planning prompt without changing their meaning", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify(result), model: "test" }) };
    const gsc = createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "gsc-1", projectId: null, provider: "googleSearchConsole", evidenceType: "searchPerformance", metric: "impressions", keyword: "휴면예금", observedAt: "2026-08-05", syncedAt: "2026-08-05T00:00:00.000Z", freshness: "fresh", verified: true, value: 12, unit: "siteImpressions", confidence: 1, limitations: ["Search Console impressions are site performance, not total market demand."], sourceReference: "snapshot-gsc:row-0:impressions", resourceScope: "query" });
    const naver = createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "naver-1", projectId: null, provider: "naverSearchTrend", evidenceType: "relativeTrend", metric: "searchTrendRatio", keyword: "예금", observedAt: "2026-08-05", syncedAt: "2026-08-05T00:01:00.000Z", freshness: "fresh", verified: true, value: 65.2, relativeValue: 65.2, unit: "relativeRatio", confidence: 1, limitations: ["NAVER ratio is relative and is not absolute search volume."], sourceReference: "snapshot-naver:row-0", resourceScope: "query" });

    await new ContentPlanningStrategy(provider).analyze("오늘의 생활경제 글을 골라줘", ["wordpress"], {
      projectId: "project-finance",
      selectionMode: "automatic",
      hasVerifiedKeywordData: true,
      evidenceBundle: [gsc, naver],
    });

    expect(provider.generate).toHaveBeenCalledOnce();
    const instruction = provider.generate.mock.calls[0]?.[0].instruction as string;
    expect(instruction).toContain(`"evidenceId":"${gsc.evidenceId}"`);
    expect(instruction).toContain('"provider":"googleSearchConsole"');
    expect(instruction).toContain('"unit":"siteImpressions"');
    expect(instruction).toContain(`"evidenceId":"${naver.evidenceId}"`);
    expect(instruction).toContain('"provider":"naverSearchTrend"');
    expect(instruction).toContain('"unit":"relativeRatio"');
    expect(instruction).toContain("NAVER/Trends ratios are relative");
    expect(instruction).toContain("Search Console impressions are site impressions");
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
      sourceRequest: "밝은재테크 프로젝트에서 아직 다루지 않은 주제를 선정해 주제에 관심 있는 일반 독자를 위한 Google SEO 정보 콘텐츠 원고를 작성해줘. 세부 주제: 생활경제·재테크 콘텐츠 운영. 제외 주제: 없음.",
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
      "밝은재테크 통장 쪼개기",
      "밝은재테크 통장 쪼개기 방법",
      "밝은재테크 프로젝트에서 아직 다루지 않은 주제를 선정해줘",
      ["밝은재테크"],
      false,
    )).toBe("통장 쪼개기 방법");
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

describe("planning editorial diversity instruction", () => {
  const diversityContext = JSON.stringify({
    projectStrategy: { primaryTopic: "생활재테크" },
    editorialDiversityPolicy: {
      rule: "새 글은 이들과 제목 문형, 소제목 문형, 도입부 화법이 겹치지 않아야 한다.",
      recentArticles: [
        { title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성을 판단하는 기준", headings: ["우대금리 조건"], openingSentence: "적금 우대금리의 핵심은 조건 확인에 있습니다." },
      ],
      formatRule: "순번대로 돌려쓰지 말고 이번 주제가 실제로 뒷받침하는 형태를 고른다.",
      formatOptions: [
        { id: "procedure", name: "절차 안내형", skeleton: "준비 서류 → 단계별 절차", fitsWhen: "신청 방법을 알아야 할 때" },
      ],
      introStyles: ["핵심 답변을 먼저 제시하고 조건을 뒤에 설명"],
    },
  });

  async function instructionFor(projectContext?: string): Promise<string> {
    const provider = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify(result), model: "test" }) };
    await new ContentPlanningStrategy(provider).analyze("오늘의 생활경제 글을 골라줘", undefined, {
      projectId: "project-finance",
      selectionMode: "automatic",
      ...(projectContext ? { projectContext } : {}),
    });
    return provider.generate.mock.calls[0]?.[0].instruction as string;
  }

  /**
   * Nested in the context JSON the policy lost to the prompt's own wording
   * conventions, so it has to be restated at instruction rank.
   */
  it("states the diversity rule in the prompt body, not only inside the context JSON", async () => {
    const instruction = await instructionFor(diversityContext);
    const body = instruction.slice(0, instruction.indexOf("Project strategy:"));

    expect(body).toContain("Editorial diversity contract");
    expect(body).toContain("제목 문형, 소제목 문형, 도입부 화법이 겹치지 않아야 한다");
    expect(body).toContain("적금 우대금리 조건 확인 방법");
    expect(body).toContain("절차 안내형");
    expect(body).toContain("핵심 답변을 먼저 제시하고");
  });

  it("requires the candidates to differ from each other, not only from the published articles", async () => {
    expect(await instructionFor(diversityContext))
      .toContain("후보끼리도 제목 문형이 서로 달라야 한다");
  });

  it("keeps factual accuracy and the approval policy above the diversity contract", async () => {
    expect(await instructionFor(diversityContext))
      .toContain("it never outranks factual accuracy or the approval policy");
  });

  it("adds nothing when the context carries no diversity policy", async () => {
    const instruction = await instructionFor(JSON.stringify({ projectStrategy: { primaryTopic: "생활재테크" } }));

    expect(instruction).not.toContain("Editorial diversity contract");
  });

  it("adds nothing when there is no project context at all", async () => {
    expect(await instructionFor()).not.toContain("Editorial diversity contract");
  });

  /**
   * primaryKeyword still carries the task modifier readers search for; only the
   * requirement that selectedTopic restate it verbatim is gone, because that is
   * what produced `<주제> 방법: <설명절>` for every candidate.
   */
  /**
   * Opportunity alignment blocks the article when selectedTopic carries under
   * 60 percent of the primaryKeyword's terms. Telling Planning it could reword
   * the topic cost exactly that: 정부지원금 찾는 방법 became 정부지원금 탐색과 대상
   * 후보 정리, alignment read 50 percent, and topicFidelity,
   * contentOpportunityConsistency and crossTopicDrift all failed at once.
   * Diversity belongs to the title, which the generation call writes.
   */
  it("keeps the topic tied to the keyword and sends title variety elsewhere", async () => {
    const instruction = await instructionFor(diversityContext);

    expect(instruction).toContain("including a task modifier such as 방법, 비교, 기준");
    expect(instruction).toContain("The selectedTopic should naturally contain the primaryKeyword phrase");
    expect(instruction).toContain("blocks the article below 60 percent");
    expect(instruction).toContain("Title shape is varied when the article is written, not by loosening the topic");
  });
});
