import { describe, expect, it } from "vitest";

import { confirmContentOpportunity, createContentOpportunityCandidate, type ContentDocument } from "../../../../core/content";
import { contentRevisionId, PublishingGate, QualityEngine, qualityDimensionWeights, resolveQualityApproval } from "../../../../core/quality";

const planning: ContentDocument = { id: "planning", title: "건강 관리 가이드 기획안", blocks: [
  { id: "h", type: "heading", level: 2, text: "작성할 내용" },
  { id: "p", type: "paragraph", text: "이 글에서는 건강 관리 방법을 다룰 예정입니다. 구체적인 사례와 결론은 추가 예정입니다." },
] };

function structured(): ContentDocument {
  const paragraph = "독자가 바로 실행할 수 있도록 원인과 방법을 구체적인 사례로 설명합니다. 매일 기록하고 결과를 비교하면 자신의 상황에 맞는 선택을 할 수 있습니다. ";
  return { id: "article", title: "건강 관리 실천 방법 완전 가이드", blocks: [
    { id: "intro", type: "paragraph", text: paragraph.repeat(3) },
    ...Array.from({ length: 4 }, (_, index) => ([
      { id: `h${index}`, type: "heading" as const, level: 2 as const, text: `실천 단계 ${index + 1}` },
      { id: `p${index}`, type: "paragraph" as const, text: paragraph.repeat(8) },
    ])).flat(),
    { id: "image", type: "image", source: "/health.png", alt: "건강 관리 단계" },
    { id: "link", type: "button", label: "관련 건강 기록 보기", targetUrl: "/health-log" },
    { id: "conclusion", type: "paragraph", text: `지금까지의 핵심은 작은 행동을 기록하고 꾸준히 조정하는 것입니다. ${paragraph.repeat(2)}` },
  ] };
}

describe("QualityEngine dimension scoring", () => {
  it("never gives a planning document a publish-ready score", () => {
    const report = new QualityEngine().review(planning, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법", reviewedAt: "2026-01-01T00:00:00.000Z" });
    expect(report.overallScore).toBeLessThan(70);
    expect(report.overallScore).not.toBe(100);
    expect(report.approved).toBe(false);
    expect(report.dimensions.find((item) => item.category === "completeness")?.evidence).toContainEqual({ signal: "planningLanguageDetected", value: true });
    expect(report.tasks.length).toBeGreaterThan(0);
  });

  it("blocks an empty document and exposes not_evaluated evidence", () => {
    const report = new QualityEngine().review({ id: "empty", title: "", blocks: [] });
    expect(report.overallScore).toBeLessThan(30);
    expect(report.dimensions.find((item) => item.category === "searchIntent")).toMatchObject({ status: "blocked", evaluation: "not_evaluated" });
  });

  it("scores a structured article higher than a short incomplete article", () => {
    const context = { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리" };
    const short = new QualityEngine().review({ id: "short", title: "건강 관리", blocks: [{ id: "p", type: "paragraph", text: "짧은 설명입니다." }] }, context);
    const complete = new QualityEngine().review(structured(), context);
    expect(complete.overallScore).toBeGreaterThan(short.overallScore);
    expect(complete.dimensions).toHaveLength(10);
  });

  it("calculates the overall score from the canonical weights", () => {
    const report = new QualityEngine().review(structured(), { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리" });
    const expected = Math.round(report.dimensions.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0) / 100);
    expect(Object.values(qualityDimensionWeights).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(report.overallScore).toBe(expected);
  });

  it("matches the reviewed revision and invalidates stale approval", () => {
    const document = structured(), revision = contentRevisionId(document);
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리", revisionId: revision });
    expect(report.reviewedRevisionId).toBe(revision);
    expect(() => new PublishingGate().assertReady({ ...report, approved: true }, "rev-stale")).toThrow("stale");
  });

  it("distinguishes recommendations from placed image, internal-link, and CTA blocks", () => {
    const recommended: ContentDocument = { id: "recommendations", title: "추천만 있는 문서", blocks: [
      { id: "p", type: "paragraph", text: "이미지 전략과 CTA 전략, 내부 링크 계획을 추천합니다." },
      { id: "image", type: "image", source: "", alt: "추천 이미지" },
      { id: "internal", type: "button", purpose: "internal_link", label: "관련 글", targetUrl: "https://bright-health.tistory.com/entry/related" },
    ] };
    const report = new QualityEngine().review(recommended, { primaryKeyword: "추천", searchIntent: "추천" });
    expect(report.dimensions.find((item) => item.category === "imageStrategy")).toMatchObject({ score: 94 });
    expect(report.dimensions.find((item) => item.category === "internalLinks")?.evidence).toContainEqual({ signal: "placedContextualInternalLinks", value: 1 });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ score: 100, status: "ready", evaluation: "not_evaluated" });
    expect(report.dimensions.find((item) => item.category === "cta")?.evidence).toContainEqual({ signal: "scoringExcluded", value: true });
  });

  it("keeps internal-link placement diagnostics outside the quality score", () => {
    const document: ContentDocument = { id: "related-only", title: "관련 글만 있는 원고", blocks: [
      { id: "p", type: "paragraph", text: "본문 중간 링크 없이 관련 글만 배치된 원고입니다. 두 번째 문장으로 품질 평가 조건을 설명합니다." },
      ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}`, target: "_self" as const })),
    ] };
    const dimension = new QualityEngine().review(document, { platform: "tistory", primaryKeyword: "관련 글", searchIntent: "관련 글 확인" }).dimensions.find((item) => item.category === "internalLinks");
    expect(dimension?.score).toBe(100);
    expect(dimension?.evaluation).toBe("not_evaluated");
    expect(dimension?.evidence).toContainEqual({ signal: "scoringExcluded", value: true });
    expect(dimension?.evidence).toContainEqual({ signal: "placedRelatedPosts", value: 3 });
  });

  it("reports duplicated image prompts as a concrete image-strategy task", () => {
    const document: ContentDocument = { id: "duplicate-images", title: "중년 운동", blocks: [
      { id: "h1", type: "heading", level: 2, text: "호흡 준비" },
      { id: "p1", type: "paragraph", text: "어깨를 내리고 호흡을 천천히 정리합니다." },
      { id: "image-1", type: "image", source: "", purpose: "inline", alt: "호흡 준비 자세", prompt: "중년 여성이 거실에서 스트레칭하는 모습" },
      { id: "h2", type: "heading", level: 2, text: "허리 자세" },
      { id: "p2", type: "paragraph", text: "무릎과 골반의 위치를 확인하며 허리를 늘립니다." },
      { id: "image-2", type: "image", source: "", purpose: "inline", alt: "허리와 골반 자세", prompt: "중년 여성이 거실에서 스트레칭하는 모습" },
    ] };
    const dimension = new QualityEngine().review(document, { primaryKeyword: "중년 운동", searchIntent: "중년 운동 자세" }).dimensions.find((item) => item.category === "imageStrategy");

    expect(dimension?.score).toBeLessThan(85);
    expect(dimension?.evidence).toContainEqual({ signal: "duplicateImagePrompts", value: 1 });
    expect(dimension?.tasks.join(" ")).toContain("핵심 대상·행동·배경·구도·시점·정보 표현 중 두 가지 이상");
  });

  it("does not award 100 image-strategy points to many general images with repeated roles", () => {
    const blocks = Array.from({ length: 5 }, (_, index) => [
      { id: `h-${index}`, type: "heading" as const, level: 2 as const, text: `건강 확인 기준 ${index + 1}` },
      { id: `p-${index}`, type: "paragraph" as const, text: `각 섹션의 확인 기준을 설명합니다. 독자는 상황을 구분해 다음 행동을 정할 수 있습니다.` },
      { id: `image-${index}`, type: "image" as const, source: "", purpose: "inline" as const, alt: `건강 확인 기준 ${index + 1} 설명 이미지`, prompt: `건강 확인 기준 ${index + 1}을 설명하는 서로 다른 생활 장면과 도구 배치, 교육적 구도, 텍스트와 로고 없음` },
    ]).flat();
    const document: ContentDocument = { id: "many-general-images", title: "건강 확인 가이드", blocks };
    const dimension = new QualityEngine().review(document, { primaryKeyword: "건강 확인", searchIntent: "건강 확인 방법" }).dimensions.find((item) => item.category === "imageStrategy");
    expect(dimension?.score).toBeLessThan(100);
    expect(dimension?.evidence).toContainEqual({ signal: "repeatedImageRolePenalty", value: 15 });
  });

  it("penalizes repeated one-sentence paragraphs and keyword stuffing", () => {
    const repeated = "건강 관리가 중요합니다.";
    const document: ContentDocument = { id: "repeated", title: "건강 관리 건강 관리 건강 관리", metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 30, metaDescription: "건강 관리 ".repeat(20) }, blocks: Array.from({ length: 18 }, (_, index) => ({ id: `p-${index}`, type: "paragraph", text: repeated })) };
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.dimensions.find((item) => item.category === "readability")?.score).toBeLessThan(80);
    expect(report.dimensions.find((item) => item.category === "seo")?.score).toBeLessThan(80);
  });

  it("blocks unsupported statistics and fabricated first-person experience", () => {
    const document: ContentDocument = { id: "unsafe", title: "건강 관리 방법", blocks: [
      { id: "intro", type: "paragraph", text: "제가 직접 먹어봤고 연구에 따르면 97%가 좋아졌습니다. 건강 관리 방법을 설명합니다." },
      { id: "h", type: "heading", level: 2, text: "실천 방법" },
      { id: "p", type: "paragraph", text: "검증되지 않은 개인 경험을 사실처럼 단정하는 본문입니다." },
    ] };
    const report = new QualityEngine().review(document, { primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.dimensions.find((item) => item.category === "usefulness")).toMatchObject({ status: "blocked" });
    expect(report.approved).toBe(false);
  });

  it("blocks market-volume claims when the canonical Opportunity has no external market Evidence", () => {
    const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({ sourceRequest: "건강 관리 글", selectionMode: "automatic", selectedTopic: "건강 관리 방법", primaryKeyword: "건강 관리", secondaryKeywords: [], searchIntent: "건강 관리 방법 탐색", audience: "일반 성인", contentType: "article", contentAngle: "실천 안내", readerProblem: "관리 기준 부족", expectedCoverage: ["실천 단계"], selectionRationale: "콘텐츠 공백", opportunityEvidence: [{ source: "inferred", summary: "내부 콘텐츠 공백" }], recommendationType: "blogGrowth", evidenceIds: [], marketEvidenceStatus: "unavailable", internalGrowthEvidenceStatus: "verified", freshness: "fresh", limitations: ["검색 수요는 검증되지 않았습니다."], classificationVersion: 1, confidence: 0.7, cautions: [], projectId: "project-1" }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "article", confirmedAt: "now" });
    const document = structured();
    const withClaim = { ...document, id: "article", blocks: [{ id: "claim", type: "paragraph" as const, text: "이 키워드는 월간 검색량 12,000회이며 시장 1위입니다." }, ...document.blocks] };
    const report = new QualityEngine().review(withClaim, { primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법 탐색", opportunity });
    expect(report.approved).toBe(false);
    expect(report.tasks.some((task) => task.message.includes("외부 시장 Evidence"))).toBe(true);
  });

  it("can approve a complete article without uploaded images or an unnecessary CTA", () => {
    const base = structured();
    const filler = "독자가 실천할 수 있는 기준과 확인 순서를 구체적으로 설명합니다. 결과를 기록하고 비교하면 상황에 맞게 방법을 조정할 수 있습니다. ";
    const rawBlocks: ContentDocument["blocks"] = [
      ...base.blocks.filter((block) => block.type !== "button").flatMap((block) => block.type === "paragraph" && block.text.length > 500 ? [{ ...block, id: `${block.id}-a`, text: block.text.slice(0, Math.ceil(block.text.length / 2)) }, { ...block, id: `${block.id}-b`, text: block.text.slice(Math.ceil(block.text.length / 2)) }] : [block]).map((block) => block.type === "image" ? { ...block, source: "" } : block),
      { id: "h-extra", type: "heading", level: 2, text: "상황별 조정 기준" },
      ...Array.from({ length: 10 }, (_, index) => ({ id: `filler-${index}`, type: "paragraph" as const, text: `${index + 1}번째 확인 항목에서는 조건을 구분합니다. ${filler.repeat(3)}` })),
      { id: "internal", type: "button", purpose: "internal_link", label: "건강 기록", targetUrl: "https://bright-health.tistory.com/entry/health-log" },
      ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 건강 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}` })),
    ];
    const blocks = rawBlocks.map((block, index) => block.type === "paragraph" ? { ...block, text: `${index + 1}번째 문단은 서로 다른 관점에서 설명합니다. ${block.text}` } : block);
    const document: ContentDocument = { ...base, metadata: { buttonCount: 4, createdAt: "now", generator: "test", imageCount: 1, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1000, metaDescription: "건강 관리 방법을 생활 속에서 실천할 수 있도록 준비 단계와 확인 기준, 흔한 실수, 상황별 조정 방법을 구체적으로 안내합니다.", primarySearchIntent: "건강 관리 방법을 찾는 독자에게 실천 기준을 제공합니다." }, blocks };
    const report = new QualityEngine().review(document, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.overallScore).toBeGreaterThanOrEqual(95);
    expect(report.approved).toBe(true);
    expect(report.reviewedRevisionId).toBe(contentRevisionId(document));
    expect(report.dimensions.find((item) => item.category === "imageStrategy")?.evidence).toContainEqual({ signal: "uploadedImageBlocks", value: 0 });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ evaluation: "not_evaluated", status: "ready" });
  });

  it("exception-approves only integrity-safe scores between 90 and 94", () => {
    const dimensions = [
      { category: "searchIntent" as const, score: 92 },
      { category: "seo" as const, score: 91 },
      { category: "readability" as const, score: 90 },
      { category: "completeness" as const, score: 93 },
      { category: "structure" as const, score: 84 },
      { category: "usefulness" as const, score: 88 },
      { category: "htmlQuality" as const, score: 100 },
      { category: "imageStrategy" as const, score: 90 },
      { category: "internalLinks" as const, score: 100 },
      { category: "cta" as const, score: 100 },
    ];
    expect(resolveQualityApproval(92, dimensions, true)).toEqual({ approved: true, approvalType: "exception" });
    expect(resolveQualityApproval(92, dimensions, false)).toEqual({ approved: false, approvalType: "none" });
    expect(resolveQualityApproval(89, dimensions, true)).toEqual({ approved: false, approvalType: "none" });
    expect(resolveQualityApproval(92, dimensions.map((item) => item.category === "seo" ? { ...item, score: 89 } : item), true)).toEqual({ approved: false, approvalType: "none" });
  });

  it("never treats exception approval as publishing ready", () => {
    const report = new QualityEngine().review(structured(), { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(() => new PublishingGate().assertReady({ ...report, approved: true, approvalType: "exception" })).toThrow("standard quality approval is required");
  });

  it("always exposes a reason for every dimension score", () => {
    const report = new QualityEngine().review(structured(), { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.dimensions.every((dimension) => dimension.reasons.length > 0)).toBe(true);
  });

  it("explains structure, completeness, and usefulness deductions", () => {
    const document: ContentDocument = { id: "diagnostic", title: "가정혈압 측정 방법", blocks: [
      { id: "intro", type: "paragraph", text: "한 번의 숫자보다 같은 조건에서 기록하는 것이 중요합니다. 일정 기간 기록하고 필요한 경우 의료진에게 보여 주세요." },
      { id: "h1", type: "heading", level: 2, text: "같은 조건으로 측정하기" },
      { id: "p1", type: "paragraph", text: "같은 조건에서 재고 기록해야 합니다. 내부 링크를 연결하기 좋습니다." },
      { id: "h2", type: "heading", level: 2, text: "같은 조건에서 다시 측정하기" },
      { id: "p2", type: "paragraph", text: "잠시 쉬고 필요한 경우 다시 측정하며 기록을 남깁니다." },
      { id: "end", type: "paragraph", text: "한 번의 수치로 판단하지 말고 기록하십시오." },
    ] };
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "가정혈압 측정 방법", searchIntent: "집에서 혈압 재는 법" });
    expect(report.dimensions.find((item) => item.category === "structure")?.reasons.join(" ")).toMatch(/겹치는|반복|편집자용/);
    expect(report.dimensions.find((item) => item.category === "completeness")?.reasons.join(" ")).toContain("구체적인 시간·횟수·순서");
    expect(report.dimensions.find((item) => item.category === "usefulness")?.reasons.join(" ")).toContain("실용 도구");
  });

  it("keeps CTA outside scoring while HTML still detects broken CTA markup", () => {
    const document: ContentDocument = { id: "weak-elements", title: "건강 안내", blocks: [
      { id: "p", type: "paragraph", text: "건강 안내 내용을 확인합니다." },
      { id: "cta", type: "button", purpose: "cta", label: "자세히 보기", targetUrl: "invalid-url", target: "_self" },
      { id: "cta", type: "paragraph", text: "중복 ID가 있는 문단입니다." },
    ] };
    const report = new QualityEngine().review(document, { platform: "tistory", primaryKeyword: "건강 안내", searchIntent: "건강 안내" });
    expect(report.dimensions.find((item) => item.category === "cta")).toMatchObject({ score: 100, evaluation: "not_evaluated" });
    expect(report.dimensions.find((item) => item.category === "htmlQuality")?.score).toBeLessThan(100);
  });

  it("penalizes missing Tistory bottom tags in SEO and exposes derived tags", () => {
    const document: ContentDocument = { id: "tags", title: "혈압", metadata: { buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 10, metaDescription: "혈압을 집에서 측정하는 방법과 기록 요령을 설명하는 짧은 안내입니다." }, blocks: [{ id: "p", type: "paragraph", text: "혈압을 측정하고 기록합니다." }] };
    const seo = new QualityEngine().review(document, { platform: "tistory", primaryKeyword: "혈압", searchIntent: "혈압 측정" }).dimensions.find((item) => item.category === "seo");
    expect(seo?.score).toBeLessThan(100);
    expect(seo?.evidence.some((item) => item.signal === "tistoryTagCount")).toBe(true);
  });

  it("excludes internal links and CTA from overall approval scoring", () => {
    const base = structured();
    const withoutButtons = { ...base, blocks: base.blocks.filter((block) => block.type !== "button") };
    const report = new QualityEngine().review(withoutButtons, { contentType: "article", platform: "tistory", primaryKeyword: "건강 관리", searchIntent: "건강 관리 방법" });
    expect(report.weights.internalLinks).toBe(0);
    expect(report.weights.cta).toBe(0);
    expect(report.dimensions.find((item) => item.category === "internalLinks")?.evaluation).toBe("not_evaluated");
    expect(report.dimensions.find((item) => item.category === "cta")?.evaluation).toBe("not_evaluated");
  });

});
