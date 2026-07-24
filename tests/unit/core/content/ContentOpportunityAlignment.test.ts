import { describe, expect, it } from "vitest";

import {
  analyzeContentOpportunityAlignment,
  applyContentOpportunityPolicy,
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  titleContainsPrimaryKeyword,
  type ContentDocument,
} from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "장 건강 글", selectionMode: "userSpecified", selectedTopic: "장 건강 관리", primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["유산균", "식이섬유", "장내 환경"], searchIntent: "장 건강을 개선하는 실천 방법 탐색",
  audience: "일반 성인", contentType: "guide", contentAngle: "음식과 생활습관 중심", readerProblem: "장 건강 관리 기준 부족",
  expectedCoverage: ["유산균", "식이섬유", "장내 환경", "생활습관"], selectionRationale: "사용자가 지정한 주제",
  opportunityEvidence: [{ source: "unknown", summary: "외부 검색량 데이터 없음" }], confidence: 0.8, cautions: [], projectId: "project-1",
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });

describe("Content Opportunity manuscript alignment", () => {
  it("turns a generic provider intent label into a reader-problem-specific canonical intent", () => {
    const generic = createContentOpportunityCandidate({
      sourceRequest: "건강 기록 체크리스트", selectionMode: "automatic", selectedTopic: "매일 건강 기록 체크리스트", primaryKeyword: "건강 기록 체크리스트",
      secondaryKeywords: [], searchIntent: "informational", audience: "일반 성인", contentType: "checklist", contentAngle: "간단 사용법",
      readerProblem: "물 마신 시간과 산책 여부를 빠르게 기록하는 방법이 필요하다", expectedCoverage: ["물 마시기", "산책 기록"],
      selectionRationale: "간단한 실행 안내", opportunityEvidence: [{ source: "unknown", summary: "내부 기획" }], confidence: 0.8, cautions: [], projectId: "project-1",
    });
    expect(generic.searchIntent).toBe("정보 탐색: 물 마신 시간과 산책 여부를 빠르게 기록하는 방법이 필요하다");
    expect(generic.providerSearchIntent).toBe("informational");

    const koreanLabel = createContentOpportunityCandidate({
      ...generic,
      searchIntent: "정보형·실행형",
      providerSearchIntent: undefined,
    });
    expect(koreanLabel.providerSearchIntent).toBe("정보형·실행형");
    expect(koreanLabel.searchIntent).toBe(`정보 탐색 및 실행 준비: ${generic.readerProblem}`);
  });

  it("treats 기록지 작성법 and 건강 기록 노트 as the same search task", () => {
    const sleep = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "수면 기록 방법", selectionMode: "automatic",
      selectedTopic: "수면 시간을 건강 기록 노트에 간단히 적는 방법",
      primaryKeyword: "수면 기록지 작성법",
      secondaryKeywords: ["수면 시간 기록"], searchIntent: "정보형·실행형",
      audience: "일반 성인", contentType: "checklist", contentAngle: "간단 기록법",
      readerProblem: "수면 시간을 꾸준히 기록하는 간단한 방법이 필요하다",
      expectedCoverage: ["수면 시간", "기록 항목"], selectionRationale: "실행 안내",
      opportunityEvidence: [{ source: "unknown", summary: "AI 기획" }], confidence: 0.8, cautions: [], projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "sleep", confirmedAt: "now" });
    const article = document("수면 기록지 작성법: 건강 기록 노트에 수면 시간 적기", [
      ["수면 시간을 기록할 항목", "수면 기록지에 잠든 시간과 일어난 시간, 중간에 깬 횟수를 건강 기록 노트에 적습니다."],
      ["건강 기록 노트를 이어 쓰는 방법", "매일 같은 시간에 수면 시간 기록을 확인하고 일주일 단위로 수면 패턴을 비교합니다."],
      ["수면 기록을 점검할 때 주의할 점", "하루 결과만으로 판단하지 말고 지속되는 불편은 의료진과 상담합니다."],
    ]);
    const alignment = analyzeContentOpportunityAlignment(article, sleep);
    expect(alignment.review.topicFidelity.pass).toBe(true);
    expect(alignment.review.contentOpportunityConsistency.pass).toBe(true);
  });

  it("corrects a semantically aligned title that only omitted the exact keyword", () => {
    const original = document("음식과 생활습관으로 장을 건강하게 지키는 실천 가이드", [
      ["장내 환경을 이해하는 기준", "장 건강은 장내 환경과 식이섬유 섭취를 함께 살펴야 합니다. 유산균 선택과 생활습관을 실천하는 방법을 설명합니다."],
      ["유산균과 식이섬유 실천", "유산균과 식이섬유는 장 건강을 개선할 때 실제 식사와 생활습관 안에서 조절해야 합니다."],
    ]);
    const result = applyContentOpportunityPolicy(original, opportunity);
    expect(result.alignment.status).toBe("aligned");
    expect(titleContainsPrimaryKeyword(result.document.title, opportunity.primaryKeyword)).toBe(true);
  });

  it("does not attach the keyword to an unrelated chronic-inflammation manuscript", () => {
    const original = document("만성 염증 관리 가이드", [
      ["CRP 검사 수치", "만성 염증과 CRP 검사 수치를 이해하고 의료진과 검사 결과를 상담하는 기준을 설명합니다."],
      ["항염 식단", "항염 식단과 염증 반응을 줄이는 생활 방식을 정리합니다."],
    ]);
    const result = applyContentOpportunityPolicy(original, opportunity);
    expect(result.alignment.status).toBe("mismatch");
    expect(result.document.title).toBe("만성 염증 관리 가이드");
    expect(result.document.title).not.toContain("장 건강 관리 방법:");
  });

  it("reports missing secondary-keyword support and blocks an otherwise high score", () => {
    const unsupported = document("장 건강 관리 방법 실천 가이드", [
      ["장 건강 생활습관", "장 건강 관리 방법은 수면과 활동 리듬을 점검하는 일에서 시작합니다. 장 건강을 위해 생활습관을 꾸준히 조절합니다."],
      ["매일 확인할 기준", "장 건강 상태와 생활습관 변화를 기록하고 자신의 반응을 관찰합니다."],
    ]);
    const alignment = analyzeContentOpportunityAlignment(unsupported, opportunity);
    expect(alignment.review.secondaryKeywordSupport.pass).toBe(false);
    const report = new QualityEngine().review(unsupported, { opportunity, primaryKeyword: opportunity.primaryKeyword, searchIntent: opportunity.searchIntent });
    expect(report.approved).toBe(false);
    expect(report.approvalState).toBe("blocked");
    expect(report.dimensions.find((item) => item.category === "searchIntent")?.score).toBeGreaterThan(0);
    expect(report.tasks.some((task) => task.message.includes("보조 키워드"))).toBe(true);
  });

  it("does not treat a confirmed fatigue manuscript as a cross-topic drift when title, headings, and body follow the selected opportunity", () => {
    const fatigueOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "피로가 계속될 때", selectionMode: "automatic",
      selectedTopic: "피로가 계속될 때 생활습관 점검과 진료 필요 신호", primaryKeyword: "피로가 계속될 때",
      secondaryKeywords: ["피로 생활습관", "피로 병원 진료", "수면 부족 피로"],
      searchIntent: "문제 해결형 정보 탐색: 충분히 쉬어도 피로가 지속될 때 생활습관에서 점검할 부분과 진료를 고려할 상황을 알고 싶다.",
      audience: "피로가 지속되는 성인", contentType: "guide", contentAngle: "생활습관 점검과 진료 필요 신호",
      readerProblem: "피로 원인과 병원 방문 기준을 구분하기 어렵다",
      expectedCoverage: ["수면", "생활습관", "피로 기록", "진료 필요 신호"], selectionRationale: "선택한 추천 주제",
      opportunityEvidence: [{ source: "unknown", summary: "내부 기획" }], confidence: 0.8, cautions: [], projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-fatigue", confirmedAt: "now" });
    const article: ContentDocument = {
      id: "content-fatigue",
      title: "피로가 계속될 때: 생활습관 점검부터 병원 진료가 필요한 신호까지",
      metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 900, primarySearchIntent: fatigueOpportunity.searchIntent, metaDescription: "피로가 계속될 때 수면과 생활습관을 점검하고 진료가 필요한 신호를 구분하는 방법을 설명합니다." },
      blocks: [
        { id: "intro", type: "paragraph", text: "충분히 쉬었는데도 피로가 지속되면 단순히 잠이 부족한지, 생활 리듬이 흐트러졌는지, 다른 신호가 함께 있는지 차례로 살펴야 합니다." },
        { id: "h1", type: "heading", level: 2, text: "먼저 점검할 수면과 생활습관" },
        { id: "p1", type: "paragraph", text: "취침 시간과 기상 시간, 카페인 섭취, 활동량을 기록하면 반복되는 피로 원인을 찾는 데 도움이 됩니다. 수면의 질과 낮 동안의 졸림도 함께 확인합니다." },
        { id: "h2", type: "heading", level: 2, text: "피로 기록으로 확인할 변화" },
        { id: "p2", type: "paragraph", text: "피로가 심해지는 시간과 동반 증상을 적어 두면 생활습관 조정 후 변화를 비교하기 쉽습니다." },
        { id: "h3", type: "heading", level: 2, text: "병원 진료를 고려해야 하는 신호" },
        { id: "p3", type: "paragraph", text: "코골이와 호흡 이상, 참기 어려운 주간 졸림, 지속되는 불면, 흉통이나 호흡 곤란이 있으면 의료진과 상담해야 합니다." },
      ],
    };
    const alignment = analyzeContentOpportunityAlignment(article, fatigueOpportunity);
    expect(alignment.status).toBe("aligned");
    expect(alignment.review.topicFidelity.pass).toBe(true);
    expect(alignment.review.contentOpportunityConsistency.pass).toBe(true);
    expect(alignment.review.crossTopicDrift.pass).toBe(true);
  });

  it("understands descriptive Korean execution intent without requiring its framing words in the manuscript", () => {
    const exerciseOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "집에서 하는 근력운동 초보자 가이드", selectionMode: "automatic",
      selectedTopic: "집에서 하는 근력운동 초보자 가이드", primaryKeyword: "집 근력운동 초보",
      secondaryKeywords: ["초보자 근력운동 루틴", "집에서 하는 근력운동", "근력운동 4주 계획"],
      searchIntent: "정보성/실행형(어떤 운동을 어떻게 시작할지 알고 직접 따라하려는 의도)",
      audience: "근력운동을 처음 시작하는 성인", contentType: "guide", contentAngle: "주 3회 초보 루틴",
      readerProblem: "안전한 시작 순서와 강도 기준을 모름",
      expectedCoverage: ["공간·도구·안전", "기본 동작", "4주 계획", "세트와 반복 수", "부상 예방"],
      selectionRationale: "프로젝트의 운동 콘텐츠 공백", opportunityEvidence: [{ source: "unknown", summary: "내부 콘텐츠 공백" }],
      confidence: 0.75, cautions: [], projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "now" });
    const article: ContentDocument = {
      id: "content-1",
      title: "집 근력운동 초보가 안전하게 시작하는 4주 루틴",
      metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 800, primarySearchIntent: exerciseOpportunity.searchIntent, metaDescription: "집 근력운동 초보가 공간과 도구를 준비하고 기본 동작과 주 3회 4주 계획을 안전하게 따라 할 수 있도록 설명합니다." },
      blocks: [
        { id: "intro", type: "paragraph", text: "집 근력운동 초보자는 어려운 동작보다 주 3회 기본 동작을 정해진 순서로 반복하는 것이 현실적인 시작입니다. 공간과 도구를 확인하고 자신의 체력에 맞는 세트와 반복 수를 선택하면 안전하게 따라 할 수 있습니다." },
        { id: "h2-1", type: "heading", level: 2, text: "집 근력운동 초보가 먼저 준비할 공간·도구·안전" },
        { id: "p-1", type: "paragraph", text: "미끄럽지 않은 바닥과 의자, 물병을 준비하고 통증이 없는 범위부터 시작합니다. 운동 전에는 가볍게 걷고 관절을 움직여 몸을 준비합니다." },
        { id: "h2-2", type: "heading", level: 2, text: "초보자 근력운동 루틴의 기본 동작" },
        { id: "p-2", type: "paragraph", text: "스쿼트와 벽 푸시업, 브리지와 플랭크 변형을 순서대로 수행합니다. 각 동작은 자세를 먼저 익힌 뒤 세트와 반복 수를 늘립니다." },
        { id: "h2-3", type: "heading", level: 2, text: "근력운동 4주 계획과 주 3회 진행법" },
        { id: "p-3", type: "paragraph", text: "첫 주는 동작을 익히고 둘째 주부터 반복 수를 조금씩 늘립니다. 셋째 주와 넷째 주에는 마지막 세트가 약간 힘든 수준으로 조절합니다." },
        { id: "h2-4", type: "heading", level: 2, text: "세트·반복 수와 강도 조절" },
        { id: "p-4", type: "paragraph", text: "한 동작을 8회에서 12회 반복하고 1세트부터 시작합니다. 자세가 안정되면 2세트와 3세트로 늘리되 통증이 생기면 중단합니다." },
        { id: "h2-5", type: "heading", level: 2, text: "호흡과 부상 예방" },
        { id: "p-5", type: "paragraph", text: "힘을 쓸 때 숨을 내쉬고 동작을 급하게 반동으로 수행하지 않습니다. 날카로운 통증이나 어지럼증이 있으면 운동을 멈추고 필요한 평가를 받습니다." },
      ],
    };
    const alignment = analyzeContentOpportunityAlignment(article, exerciseOpportunity);
    expect(alignment.review.searchIntentFulfillment.pass).toBe(true);
    expect(alignment.review.pass).toBe(true);
    const report = new QualityEngine().review(article, { opportunity: exerciseOpportunity, primaryKeyword: exerciseOpportunity.primaryKeyword, searchIntent: exerciseOpportunity.searchIntent });
    expect(report.dimensions.find((item) => item.category === "searchIntent")?.score).toBeGreaterThanOrEqual(95);
  });
});

function document(title: string, sections: readonly (readonly [string, string])[]): ContentDocument {
  return {
    id: "content-1",
    title,
    metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 100, primarySearchIntent: opportunity.searchIntent, metaDescription: `${opportunity.primaryKeyword}을 중심으로 음식과 생활습관, 장내 환경을 구체적으로 설명하는 실천 안내입니다.` },
    blocks: sections.flatMap(([heading, text], index) => [{ id: `h-${index}`, type: "heading" as const, level: 2 as const, text: heading }, { id: `p-${index}`, type: "paragraph" as const, text }]),
  };
}
