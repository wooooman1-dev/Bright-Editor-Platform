import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PrimaryKeywordConfirmation } from "../../../../app/user-flow/PrimaryKeywordConfirmation";
import { contentDepthLabel, contentTypeLabel, evidenceTypeLabel, formatOpportunityConfidence, providerLabel, topicComplexityLabel } from "../../../../app/user-flow/opportunity-presentation";
import { createContentOpportunityCandidate } from "../../../../core/content";

const opportunity = (selectedTopic: string, primaryKeyword: string, searchIntent: string, coverage: readonly string[]) => createContentOpportunityCandidate({
  sourceRequest: "건강 글을 만들어줘", selectionMode: "automatic", selectedTopic, primaryKeyword,
  secondaryKeywords: coverage, searchIntent, audience: "건강 관리에 관심 있는 일반 성인", contentType: "guide",
  contentAngle: "실천 가능한 관리 기준 제공", readerProblem: searchIntent, expectedCoverage: coverage,
  selectionRationale: "기존 콘텐츠와의 중복이 적은 AI 추정 후보", opportunityEvidence: [{ source: "inferred", summary: "프로젝트 콘텐츠 공백 추론" }],
  confidence: 0.91, cautions: ["검색량 실측값이 아님"], projectId: "project-1",
});

const opportunities = [
  opportunity("장 건강 관리", "장 건강 관리 방법", "장 건강 개선 방법 탐색", ["장내 환경", "생활 습관"]),
  opportunity("만성 염증 완화", "만성 염증 완화 방법", "만성 염증 관리 탐색", ["CRP", "항염 식단"]),
] as const;

const plan = {
  interpretedIntent: "장 건강을 위한 생활 관리 안내",
  domain: "건강",
  targetAudience: "건강 관리에 관심 있는 일반 성인",
  contentGoal: "실천 가능한 관리 기준 제공",
  recommendedPrimaryKeyword: "장 건강 관리 방법",
  keywordCandidates: ["장 건강 관리 방법", "만성 염증 완화 방법", "저등급 염증 증상"],
  searchIntent: "정보형",
  recommendedContentType: "guide",
  recommendedPlatforms: ["tistory"],
  suggestedTitleAngles: ["장 건강 관리 방법 가이드"],
  relatedKeywords: ["장내 환경", "생활 습관"],
  contentCluster: ["식사", "수면"],
  recommendationReason: "요청과 검색 의도에 가장 직접적으로 대응합니다.",
  confidence: 0.91,
  estimateDisclosure: "AI 분석 결과이며 검색량 실측값은 아닙니다.",
  selectionMode: "automatic",
  opportunityCandidates: opportunities,
} as const;

describe("primary keyword confirmation UI", () => {
  it("shows the compact keyword choice first and keeps full planning analysis collapsed", () => {
    const html = renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled={false} onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={vi.fn()} onSelectCustom={vi.fn()} opportunityCandidates={opportunities} plan={plan} request="장 건강 관리 글을 만들어줘" selectedOpportunityId={opportunities[0].opportunityId} />);

    expect(html).toContain("콘텐츠 기회 확인");
    expect(html).not.toContain("AI 추천 1순위");
    expect(html).toContain("블로그 성장 추천");
    expect(html).toContain("외부 시장 데이터가 확인되지 않았습니다");
    expect(html).toContain("만성 염증 완화 방법");
    expect(html).toContain("직접 입력");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("AI 분석 상세보기");
    expect(html).toContain("건강 관리에 관심 있는 일반 성인");
  });

  it("marks the candidate the existing manuscript was generated from", () => {
    const html = renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled={false} generatedOpportunityId={opportunities[1].opportunityId} onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={vi.fn()} onSelectCustom={vi.fn()} opportunityCandidates={opportunities} plan={plan} request="장 건강 관리 글을 만들어줘" selectedOpportunityId={opportunities[1].opportunityId} />);

    expect(html).toContain("이 후보로 원고 생성됨");
    // Only the candidate that produced the article carries the badge.
    expect(html.split("이 후보로 원고 생성됨")).toHaveLength(2);
  });

  it("says a proposed topic was dropped and why, instead of quietly showing a shorter list", () => {
    const html = renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled={false} onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={vi.fn()} onSelectCustom={vi.fn()} opportunityCandidates={opportunities} plan={{ ...plan, excludedOpportunities: [{ selectedTopic: "혈당 관리", primaryKeyword: "혈당 관리 방법", reason: "이미 공개된 콘텐츠와 주제가 중복됩니다." }] }} request="장 건강 관리 글을 만들어줘" selectedOpportunityId={opportunities[0].opportunityId} />);

    expect(html).toContain("이번 분석에서 제외된 주제 1개");
    expect(html).toContain("혈당 관리");
    expect(html).toContain("이미 공개된 콘텐츠와 주제가 중복됩니다.");
    expect(html).toContain("2개 · 제외 1개");
  });

  it("shows no exclusion notice when every proposed topic survived", () => {
    const html = renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled={false} onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={vi.fn()} onSelectCustom={vi.fn()} opportunityCandidates={opportunities} plan={plan} request="장 건강 관리 글을 만들어줘" selectedOpportunityId={opportunities[0].opportunityId} />);

    expect(html).not.toContain("제외된 주제");
    expect(html).not.toContain("이 후보로 원고 생성됨");
  });

  it("does not call confirmation callbacks merely by rendering the planning result", () => {
    const onSelectCandidate = vi.fn();
    const onSelectCustom = vi.fn();
    renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={onSelectCandidate} onSelectCustom={onSelectCustom} opportunityCandidates={opportunities} plan={plan} request="장 건강 관리 글을 만들어줘" selectedOpportunityId={opportunities[0].opportunityId} />);

    expect(onSelectCandidate).not.toHaveBeenCalled();
    expect(onSelectCustom).not.toHaveBeenCalled();
  });

  it("renders stored confidence, planning enums, providers, and limitations as deduplicated Korean presentation values", () => {
    const marketCandidate = createContentOpportunityCandidate({
      sourceRequest: "오늘의 건강 글",
      selectionMode: "automatic",
      selectedTopic: "장 건강 관리 방법 비교",
      primaryKeyword: "장 건강 관리 방법",
      secondaryKeywords: ["장 건강"],
      searchIntent: "장 건강 관리 방법을 비교하고 선택하려는 정보 탐색",
      audience: "일반 성인",
      contentType: "how_to",
      qualityTarget: { ...opportunities[0].qualityTarget, contentDepth: "comparison", topicComplexity: "moderate" },
      contentAngle: "실행 가능한 관리 기준 제공",
      readerProblem: "관리 방법을 선택할 기준이 부족함",
      expectedCoverage: ["선택 기준"],
      selectionRationale: "상대 검색 추세와 콘텐츠 공백이 함께 확인됨",
      opportunityEvidence: [
        { source: "verified", summary: "naverSearchTrend · relativeTrend · searchTrendRatio · 72 relativeRatio", evidenceId: "evidence-naver-ratio", provider: "naverSearchTrend", evidenceType: "relativeTrend", metric: "searchTrendRatio", freshness: "fresh", verified: true, limitation: "NAVER Search Trend ratios are relative trend indices, not absolute search volume. NAVER ratio is a relative trend index and is not absolute search volume." },
        { source: "verified", summary: "naverSearchTrend · risingTrend · trendChange · 0.5 relativeChangeRate", evidenceId: "evidence-naver-rising", provider: "naverSearchTrend", evidenceType: "risingTrend", metric: "trendChange", freshness: "fresh", verified: true, limitation: "NAVER Search Trend ratios are relative trend indices, not absolute search volume. A rising relative trend does not establish absolute market size." },
        { source: "inferred", summary: "brightStudio · contentGap · 0 publishedContentCount", evidenceId: "evidence-internal", provider: "brightStudio", evidenceType: "contentGap", freshness: "fresh", verified: true, limitation: "Internal growth Evidence is not external market demand. A dedicated Content Library projection is not implemented; only current Project metadata and verified public URLs are used." },
      ],
      recommendationType: "marketOpportunity",
      evidenceIds: ["evidence-naver-ratio", "evidence-naver-rising", "evidence-internal"],
      marketEvidenceStatus: "verified",
      internalGrowthEvidenceStatus: "verified",
      freshness: "fresh",
      limitations: [
        "NAVER Search Trend ratios are relative trend indices, not absolute search volume.",
        "NAVER ratio is a relative trend index and is not absolute search volume.",
        "A rising relative trend does not establish absolute market size.",
        "Internal growth Evidence is not external market demand.",
        "A dedicated Content Library projection is not implemented; only current Project metadata and verified public URLs are used.",
      ],
      classificationVersion: 1,
      confidence: (1 + 1 + 0.75) / 3,
      cautions: [],
      projectId: "project-1",
    });
    const marketPlan = { ...plan, confidence: marketCandidate.confidence, estimateDisclosure: "Keyword competition and opportunity are AI estimates, not measured search-volume, CPC, or competition data.", recommendedPlatforms: ["wordpress"] as const, opportunityCandidates: [marketCandidate] };

    const html = renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled={false} onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={vi.fn()} onSelectCustom={vi.fn()} opportunityCandidates={[marketCandidate]} plan={marketPlan} request="오늘의 건강 글" selectedOpportunityId={marketCandidate.opportunityId} />);

    expect(html).toContain("콘텐츠 깊이 · 비교·선택 가이드");
    expect(html).toContain("콘텐츠 유형 · 실행 방법");
    expect(html).toContain("주제 복잡도 · 보통");
    expect(html).toContain("선정 근거 데이터 · Bright Studio 내부 데이터, NAVER 검색 트렌드");
    expect(html).toContain("공식 출처 ·");
    expect(html).toContain("최신성 · 최신 · 신뢰도 92%");
    expect(html).toContain("상승 추세만으로 절대적인 시장 규모를 확정할 수 없습니다.");
    expect(html).toContain("전용 콘텐츠 라이브러리 분석은 아직 구현되지 않아 현재 프로젝트 메타데이터와 확인된 공개 URL만 사용합니다.");
    expect(html.split("NAVER 검색 트렌드는 절대 검색량이 아닌 상대 추세 지수입니다.")).toHaveLength(2);
    expect(html).not.toMatch(/naverSearchTrend|brightStudio|\bcomparison\b|\bhow_to\b|\bmoderate\b|\bfreshness\b|\bconfidence\b/);
    expect(html).not.toContain("NAVER Search Trend ratios are relative trend indices");
    expect(html).not.toContain("Internal growth Evidence");
    expect(html).not.toContain("Content Library projection");
    expect(marketCandidate.contentType).toBe("how_to");
    expect(marketCandidate.qualityTarget.contentDepth).toBe("comparison");
    expect(marketCandidate.qualityTarget.topicComplexity).toBe("moderate");
    expect(marketCandidate.opportunityEvidence.some((item) => item.provider === "naverSearchTrend")).toBe(true);
  });

  /**
   * 2026-09-05 실측: CRITICAL Claim 2건을 가진 후보가 "공식 출처 · 붙음"으로
   * 표시됐는데, 실제 생성 시점에는 웹 검색 32건 중 어느 것도 출처 요건을
   * 통과하지 못해 그대로 실패했다. "붙음"은 기획 단계의 계획일 뿐 실제 검증이
   * 아니므로, 이미 확보된 것처럼 보이는 완료형 문구 대신 아직 검증 전임을
   * 분명히 밝힌다.
   */
  it("does not claim an official source is already attached before generation-time preflight verifies it", () => {
    const withCriticalClaim = {
      ...opportunities[0],
      verificationPlan: {
        schemaVersion: 1,
        mode: "explicit",
        claims: [{
          claimId: "claim-refund-deadline",
          atomicity: "single_assertion",
          field: "연회비 반환 기한",
          kind: "duration",
          statement: "카드 해지 후 일정 기간 내 연회비를 반환해야 한다.",
          qualifiers: { subject: "", scope: "", basis: "", note: "" },
          temporalRequirement: { mode: "notRequired" },
          required: true,
          risk: "critical",
        }],
        fingerprint: "vfp-test",
      },
    } as unknown as (typeof opportunities)[number];

    const html = renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled={false} onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={vi.fn()} onSelectCustom={vi.fn()} opportunityCandidates={[withCriticalClaim]} plan={{ ...plan, opportunityCandidates: [withCriticalClaim] }} request="신용카드 연회비 환불 기준 글을 만들어줘" selectedOpportunityId={withCriticalClaim.opportunityId} />);

    expect(html).toContain("공식 출처 · 확인 필요 (1건: 연회비 반환 기한)");
    expect(html).toContain("아직 검증 전");
    expect(html).not.toContain("공식 출처 · 붙음");
  });

  it("converts normalized confidence values to UI percentages", () => {
    expect(formatOpportunityConfidence(0)).toBe("0%");
    expect(formatOpportunityConfidence(0.91666)).toBe("92%");
    expect(formatOpportunityConfidence(1)).toBe("100%");
  });

  it("covers every current Opportunity display enum without changing its stored identifier", () => {
    const providers = ["googleSearchConsole", "googleAnalytics4", "googleAdSense", "youtubeAnalytics", "naverSearchTrend", "googleAdsKeywordPlanning", "googleTrendsOfficial", "brightStudio"] as const;
    const evidenceTypes = ["searchPerformance", "searchDemand", "relativeTrend", "risingTrend", "keywordCompetition", "commercialIntent", "pageEngagement", "revenuePerformance", "videoPerformance", "contentGap", "internalLinkOpportunity", "clusterOpportunity", "editorialInference"] as const;

    expect(providers.map(providerLabel)).toEqual(["Google Search Console", "Google Analytics 4", "Google AdSense", "YouTube Analytics", "NAVER 검색 트렌드", "Google Ads 키워드 플래닝", "Google Trends 공식 데이터", "Bright Studio 내부 데이터"]);
    expect(evidenceTypes.map(evidenceTypeLabel)).toEqual(["검색 성과", "검색 수요", "상대 검색 추세", "상승 추세", "광고 경쟁", "상업 의도", "페이지 참여", "수익 성과", "동영상 성과", "콘텐츠 공백", "내부 링크 기회", "콘텐츠 클러스터", "편집 추론"]);
    expect(["quick", "standard", "deep", "comparison"].map(contentDepthLabel)).toEqual(["핵심 요약 가이드", "핵심 문제 해결 가이드", "심층 가이드", "비교·선택 가이드"]);
    expect(contentTypeLabel("how_to")).toBe("실행 방법");
    expect((["low", "moderate", "high"] as const).map(topicComplexityLabel)).toEqual(["낮음", "보통", "높음"]);
    expect(providers[4]).toBe("naverSearchTrend");
    expect(evidenceTypes[2]).toBe("relativeTrend");
  });

  it("keeps automatic planning from invoking generation without the explicit confirmation button", () => {
    const source = readFileSync(join(process.cwd(), "app/user-flow/ContentCreationFlow.tsx"), "utf8");
    const automaticStart = source.indexOf("if (!automatic || automaticStartRef.current");
    const automaticPlanning = source.slice(automaticStart, source.indexOf("  return (", automaticStart));

    expect(automaticPlanning).toContain('analyze(false, false, automaticRequest, "automatic")');
    expect(automaticPlanning).toContain("automaticStartRef.current = true");
    expect(automaticPlanning).not.toContain("confirm(true");
    const analyzeStart = source.indexOf("const analyze");
    expect(source.slice(analyzeStart, source.indexOf("const confirm =", analyzeStart))).toContain("setPlan(result.plan)");
    expect(source).toContain("이 기획으로 원고 만들기");
    expect(source).toContain("disabled={working || dirtyRequest || !confirmedOpportunity}");
  });
});


it("handles legacy candidates without limitations", () => {
  const source = readFileSync(join(process.cwd(), "app/user-flow/PrimaryKeywordConfirmation.tsx"), "utf8");
  expect(source).toContain("const limitations = formatEvidenceLimitations(stringArray(candidate.limitations))");
  expect(source).toContain("const evidence = Array.isArray(candidate.opportunityEvidence)");
});
