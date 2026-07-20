import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PrimaryKeywordConfirmation } from "../../../../app/user-flow/PrimaryKeywordConfirmation";
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

  it("does not call confirmation callbacks merely by rendering the planning result", () => {
    const onSelectCandidate = vi.fn();
    const onSelectCustom = vi.fn();
    renderToStaticMarkup(<PrimaryKeywordConfirmation customKeyword="" customKeywordSelected={false} disabled onCustomKeywordChange={vi.fn()} onReanalyzeCustom={vi.fn()} onSelectCandidate={onSelectCandidate} onSelectCustom={onSelectCustom} opportunityCandidates={opportunities} plan={plan} request="장 건강 관리 글을 만들어줘" selectedOpportunityId={opportunities[0].opportunityId} />);

    expect(onSelectCandidate).not.toHaveBeenCalled();
    expect(onSelectCustom).not.toHaveBeenCalled();
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
    expect(source).toContain("disabled={working || !confirmedOpportunity}");
  });
});


it("handles legacy candidates without limitations", () => {
  const source = readFileSync(join(process.cwd(), "app/user-flow/PrimaryKeywordConfirmation.tsx"), "utf8");
  expect(source).toContain("const limitations = stringArray(candidate.limitations)");
  expect(source).toContain("const evidence = Array.isArray(candidate.opportunityEvidence)");
});
