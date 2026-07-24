import type { ContentDocument } from "./ContentDocument";
import type { ConfirmedContentOpportunity } from "./ContentOpportunity";
import { ensureSeoKeywordPlacement, titleContainsPrimaryKeyword } from "./SeoKeywordPlacement";

export type OpportunityAlignmentStatus = "aligned" | "title_only_missing" | "mismatch";
export type OpportunityAlignmentSignal = Readonly<{
  pass: boolean;
  score: number;
  evidence: readonly string[];
  detectedMismatch?: string;
  correctionApplied: boolean;
  blockingReason?: string;
}>;
export type ContentOpportunityQualityReview = Readonly<{
  pass: boolean;
  topicFidelity: OpportunityAlignmentSignal;
  primaryKeywordAlignment: OpportunityAlignmentSignal;
  searchIntentFulfillment: OpportunityAlignmentSignal;
  secondaryKeywordSupport: OpportunityAlignmentSignal;
  titleTopicAlignment: OpportunityAlignmentSignal;
  headingCoverage: OpportunityAlignmentSignal;
  bodyCoverage: OpportunityAlignmentSignal;
  contentOpportunityConsistency: OpportunityAlignmentSignal;
  crossTopicDrift: OpportunityAlignmentSignal;
  unsupportedKeywordUsage: OpportunityAlignmentSignal;
}>;
export type ContentOpportunityAlignment = Readonly<{
  status: OpportunityAlignmentStatus;
  review: ContentOpportunityQualityReview;
}>;

export function analyzeContentOpportunityAlignment(
  document: ContentDocument,
  opportunity: ConfirmedContentOpportunity,
): ContentOpportunityAlignment {
  const headings = document.blocks.filter((block) => block.type === "heading").map((block) => block.text).join(" ");
  const body = document.blocks.filter((block) => block.type === "paragraph").map((block) => block.text).join(" ");
  const allText = `${document.title} ${headings} ${body}`;
  const topicTerms = distinctiveTerms(opportunity.selectedTopic);
  const keywordTerms = distinctiveTerms(opportunity.primaryKeyword);
  const coreTerms = [...new Set([...topicTerms, ...keywordTerms])];
  const topicKeywordCoverage = coverage(keywordTerms, opportunity.selectedTopic);
  const headingCoreCoverage = coverage(coreTerms, headings);
  const bodyCoreCoverage = coverage(coreTerms, body);
  const intentTerms = contentIntentTerms(opportunity.searchIntent);
  const intentCoverage = coverage(intentTerms, allText);
  const titleCoreCoverage = coverage(coreTerms, document.title);
  const supportedSecondary = opportunity.secondaryKeywords.filter((keyword) => phraseOrTermCoverage(keyword, allText));
  const expectedCoverage = opportunity.expectedCoverage.filter((item) => phraseOrTermCoverage(item, allText));
  const titleHasKeyword = titleContainsPrimaryKeyword(document.title, opportunity.primaryKeyword);
  const bodyHasKeyword = phraseOrTermCoverage(opportunity.primaryKeyword, body);
  const topicKeywordPass = keywordTerms.length === 0 || topicKeywordCoverage >= 0.6;
  const headingPass = coreTerms.length === 0 || headingCoreCoverage >= 0.34;
  const bodyPass = bodyHasKeyword || coreTerms.length === 0 || bodyCoreCoverage >= 0.5 || (titleHasKeyword && bodyCoreCoverage >= 0.34);
  const intentPass = intentTerms.length === 0 || intentCoverage >= 0.5 || (titleHasKeyword && intentCoverage >= 0.34);
  const secondaryPass = opportunity.secondaryKeywords.length < 2
    || supportedSecondary.length >= Math.ceil(opportunity.secondaryKeywords.length / 2);
  const expectedPass = opportunity.expectedCoverage.length === 0
    || expectedCoverage.length >= Math.max(1, Math.ceil(opportunity.expectedCoverage.length / 3));
  const titleTopicPass = titleHasKeyword || coreTerms.length === 0 || titleCoreCoverage >= 0.34;
  const structuralPass = topicKeywordPass && titleTopicPass && headingPass && bodyPass && intentPass && expectedPass;
  const status: OpportunityAlignmentStatus = structuralPass
    ? titleHasKeyword ? "aligned" : "title_only_missing"
    : "mismatch";

  const signal = (pass: boolean, score: number, evidence: string[], mismatch: string): OpportunityAlignmentSignal => Object.freeze({
    pass,
    score: pass ? Math.max(85, Math.round(score)) : Math.min(60, Math.round(score)),
    evidence: Object.freeze(evidence),
    ...(pass ? {} : { detectedMismatch: mismatch, blockingReason: mismatch }),
    correctionApplied: false,
  });
  const topicFidelity = signal(topicKeywordPass && titleTopicPass && bodyPass, Math.min(topicKeywordCoverage, Math.max(titleCoreCoverage, bodyCoreCoverage)) * 100, [
    `선정 주제: ${opportunity.selectedTopic}`,
    `대표 키워드의 선정 주제 반영률: ${percent(topicKeywordCoverage)}`,
    `본문 핵심어 반영률: ${percent(bodyCoreCoverage)}`,
  ], "선정 주제와 대표 키워드의 핵심 개념이 제목과 본문 중심 내용에 함께 반영되지 않았습니다.");
  const primaryKeywordAlignment = signal(bodyPass, bodyCoreCoverage * 100, [
    `대표 키워드: ${opportunity.primaryKeyword}`,
    `본문 대표 키워드/핵심어 반영: ${bodyHasKeyword ? "직접 확인" : percent(bodyCoreCoverage)}`,
  ], "본문이 확정 대표 키워드의 질문을 중심적으로 다루지 않습니다.");
  const searchIntentFulfillment = signal(intentPass, intentCoverage * 100, [
    `검색 의도: ${opportunity.searchIntent}`,
    `의도 핵심어 반영률: ${percent(intentCoverage)}`,
  ], "원고가 확정된 검색 의도에 충분히 답하지 않습니다.");
  const secondaryKeywordSupport = signal(secondaryPass, opportunity.secondaryKeywords.length ? supportedSecondary.length / opportunity.secondaryKeywords.length * 100 : 100, [
    `본문에서 확인된 보조 키워드: ${supportedSecondary.join(", ") || "없음"}`,
  ], "확정된 보조 키워드 대부분이 실제 원고에서 뒷받침되지 않습니다.");
  const titleTopicAlignment = signal(titleTopicPass, Math.max(titleCoreCoverage * 100, titleHasKeyword ? 100 : 0), [
    `제목: ${document.title}`,
    `제목 핵심어 반영률: ${percent(titleCoreCoverage)}`,
  ], "제목이 확정된 주제와 다른 방향을 가리킵니다.");
  const headingCoverageSignal = signal(headingPass, headingCoreCoverage * 100, [`H2/H3 핵심어 반영률: ${percent(headingCoreCoverage)}`], "목차가 확정된 주제의 핵심 범위를 구성하지 않습니다.");
  const bodyCoverageSignal = signal(bodyPass && expectedPass, Math.min(bodyCoreCoverage, expectedPass ? 1 : expectedCoverage.length / Math.max(1, opportunity.expectedCoverage.length)) * 100, [
    `본문 핵심어 반영률: ${percent(bodyCoreCoverage)}`,
    `예상 범위 반영: ${expectedCoverage.length}/${opportunity.expectedCoverage.length}`,
  ], "본문의 핵심 내용이 선택한 Content Opportunity의 예상 범위를 충족하지 않습니다.");
  const consistency = signal(structuralPass, structuralPass ? 100 : 0, [
    `Opportunity: ${opportunity.opportunityId}@${opportunity.version}`,
    `fingerprint: ${opportunity.fingerprint}`,
  ], "주제·대표 키워드·검색 의도·목차·본문 사이에 구조적인 기획 불일치가 있습니다.");
  const crossTopicDrift = signal(structuralPass, structuralPass ? 100 : 20, [
    structuralPass ? "주요 구조가 하나의 Opportunity를 따릅니다." : "확정 Opportunity 핵심어보다 다른 주제의 구조가 우세할 가능성이 있습니다.",
  ], "원고가 확정 Opportunity에서 다른 주제로 크게 이탈했습니다.");
  const unsupportedKeywordUsage = signal(secondaryPass, secondaryPass ? 100 : 40, [
    `지원되는 보조 키워드 수: ${supportedSecondary.length}/${opportunity.secondaryKeywords.length}`,
  ], "실제로 설명하지 않은 보조 키워드가 기획 또는 메타데이터에 포함되어 있습니다.");
  const review = Object.freeze({
    pass: structuralPass && secondaryPass,
    topicFidelity,
    primaryKeywordAlignment,
    searchIntentFulfillment,
    secondaryKeywordSupport,
    titleTopicAlignment,
    headingCoverage: headingCoverageSignal,
    bodyCoverage: bodyCoverageSignal,
    contentOpportunityConsistency: consistency,
    crossTopicDrift,
    unsupportedKeywordUsage,
  });
  return Object.freeze({ status, review });
}

export function applyContentOpportunityPolicy(
  document: ContentDocument,
  opportunity: ConfirmedContentOpportunity,
): Readonly<{ document: ContentDocument; alignment: ContentOpportunityAlignment }> {
  const alignment = analyzeContentOpportunityAlignment(document, opportunity);
  if (alignment.status === "mismatch") return Object.freeze({ document, alignment });
  const corrected = ensureSeoKeywordPlacement(document, opportunity.primaryKeyword);
  if (corrected === document) return Object.freeze({ document, alignment });
  const nextAlignment = analyzeContentOpportunityAlignment(corrected, opportunity);
  return Object.freeze({
    document: corrected,
    alignment: Object.freeze({
      ...nextAlignment,
      review: markCorrection(nextAlignment.review),
    }),
  });
}

function markCorrection(review: ContentOpportunityQualityReview): ContentOpportunityQualityReview {
  const changed = Object.freeze({ ...review.titleTopicAlignment, correctionApplied: true });
  return Object.freeze({ ...review, titleTopicAlignment: changed });
}

function phraseOrTermCoverage(needle: string, haystack: string): boolean {
  const normalizedNeedle = normalize(needle);
  const normalizedHaystack = normalize(haystack);
  if (normalizedNeedle && normalizedHaystack.includes(normalizedNeedle)) return true;
  const terms = distinctiveTerms(needle);
  return terms.length > 0 && coverage(terms, haystack) >= 0.6;
}

function coverage(terms: readonly string[], value: string): number {
  if (!terms.length) return 1;
  const normalized = normalize(value);
  return terms.filter((term) => normalized.includes(normalize(term))).length / terms.length;
}

function distinctiveTerms(value: string): string[] {
  const ignored = new Set(["가이드", "관리", "방법", "정보", "글", "콘텐츠", "위한", "대한", "관련", "사용자", "독자", "탐색", "의도", "알기", "이해", "실천"]);
  return [...new Set(normalize(value).split(/\s+/).map(koreanStem).filter((term) => term && !ignored.has(term)))];
}

export function contentIntentTerms(value: string): string[] {
  const ignored = new Set([
    "가이드", "관리", "방법", "정보", "정보형", "정보성", "실행형", "실행성", "비교형", "구매형", "상업형", "탐색형",
    "글", "콘텐츠", "위한", "대한", "관련", "사용자", "독자", "탐색", "의도", "알기", "알고", "이해", "실천",
    "어떤", "어떻게", "직접", "원하는", "찾는", "찾고", "확인", "확인할",
  ]);
  return [...new Set(normalize(value).split(/\s+/)
    .filter((term) => term && !ignored.has(term))
    .map(koreanStem)
    .filter((term) => term.length >= 2 && !ignored.has(term)))];
}

function koreanStem(value: string): string {
  if (!/[가-힣]/.test(value) || value.length < 2) return value;
  if (/^(?:하는|하기|하며|하고|하려는|하려고|하려면|알고|위한|대한)$/u.test(value)) return "";
  const verbSuffixes = [
    "해보려는", "해보려고", "해보려면", "하려는", "하려고", "하려면", "하는지", "할지", "하기를", "하면서",
    "하고", "하며", "하는", "하기", "해서", "되는", "되어", "이다", "이며",
  ];
  for (const suffix of verbSuffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 2) return value.slice(0, -suffix.length);
  }
  if (value.endsWith("자") && value.length > 2) return value.slice(0, -1);
  const particleSuffixes = [
    "으로는", "에서는", "에게는", "까지는", "부터는", "으로", "에서", "에게", "까지", "부터", "처럼", "보다", "들을",
    "을", "를", "은", "는", "이", "가", "의", "에", "도", "와", "과",
  ];
  for (const suffix of particleSuffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 1) return value.slice(0, -suffix.length);
  }
  return value;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣\s]/g, " ").replace(/\s+/g, " ").trim();
}

function percent(value: number): string { return `${Math.round(value * 100)}%`; }
