import type { ContentBlock } from "./ContentBlock";
import { normalizeContentPlanQualityTarget } from "./ContentDepthPolicy";
import type { ContentDocument } from "./ContentDocument";
import type { ConfirmedContentOpportunity } from "./ContentOpportunity";
import { ensureSeoKeywordPlacement, titleContainsPrimaryKeyword } from "./SeoKeywordPlacement";
import { normalizeStructuredText, serializeStructuredTable, structuredListItems, structuredTableCount } from "./StructuredText";

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
type InformationSufficiencyStatus = "missing" | "mentioned" | "sufficient";

export function analyzeContentOpportunityAlignment(
  document: ContentDocument,
  opportunity: ConfirmedContentOpportunity,
): ContentOpportunityAlignment {
  const headings = document.blocks.filter((block) => block.type === "heading").map((block) => normalizeStructuredText(block.text)).join(" ");
  const body = document.blocks.flatMap((block) => {
    const text = readableIntentBlockText(block);
    return block.type === "heading" || !text ? [] : [normalizeStructuredText(text)];
  }).join(" ");
  const allText = `${document.title} ${headings} ${body}`;
  const topicTerms = distinctiveTerms(opportunity.selectedTopic);
  const keywordTerms = distinctiveTerms(opportunity.primaryKeyword);
  const coreTerms = [...new Set([...topicTerms, ...keywordTerms])];
  const topicKeywordCoverage = coverage(keywordTerms, opportunity.selectedTopic);
  const headingCoreCoverage = coverage(coreTerms, headings);
  const bodyCoreCoverage = coverage(coreTerms, body);
  const titleCoreCoverage = coverage(coreTerms, document.title);
  const supportedSecondary = opportunity.secondaryKeywords.filter((keyword) => phraseOrTermCoverage(keyword, allText));
  const expectedCoverage = opportunity.expectedCoverage.filter((item) => phraseOrTermCoverage(item, allText));
  const titleHasKeyword = titleContainsPrimaryKeyword(document.title, opportunity.primaryKeyword);
  const bodyHasKeyword = phraseOrTermCoverage(opportunity.primaryKeyword, body);
  const topicKeywordPass = keywordTerms.length === 0 || topicKeywordCoverage >= 0.6;
  const headingPass = coreTerms.length === 0 || headingCoreCoverage >= 0.34;
  const bodyPass = bodyHasKeyword || coreTerms.length === 0 || bodyCoreCoverage >= 0.5 || (titleHasKeyword && bodyCoreCoverage >= 0.34);
  const titleTopicPass = titleHasKeyword || coreTerms.length === 0 || titleCoreCoverage >= 0.34;

  const intentDiagnostics = intentRequirements(opportunity).map((requirement) => Object.freeze({
    requirement,
    status: intentRequirementStatus(requirement, document),
  }));
  const intentMissing = intentDiagnostics.filter((item) => item.status === "missing");
  const intentMentioned = intentDiagnostics.filter((item) => item.status === "mentioned");
  const intentSufficient = intentDiagnostics.filter((item) => item.status === "sufficient");
  const intentScore = intentDiagnostics.length
    ? intentDiagnostics.reduce((sum, item) => sum + (item.status === "sufficient" ? 100 : item.status === "mentioned" ? 60 : 0), 0) / intentDiagnostics.length
    : 100;
  const intentPass = intentDiagnostics.length === 0
    || (intentMissing.length === 0 && intentSufficient.length >= Math.max(1, Math.ceil(intentDiagnostics.length * 2 / 3)));

  const secondaryPass = opportunity.secondaryKeywords.length < 2
    || supportedSecondary.length >= Math.ceil(opportunity.secondaryKeywords.length / 2);
  const expectedPass = opportunity.expectedCoverage.length === 0
    || expectedCoverage.length >= Math.max(1, Math.ceil(opportunity.expectedCoverage.length / 3));
  const topicIdentityPass = topicKeywordPass && bodyPass && (titleTopicPass || headingPass);
  const editorialFulfillmentPass = headingPass && intentPass && expectedPass;
  const structuralPass = topicIdentityPass && editorialFulfillmentPass;
  const status: OpportunityAlignmentStatus = !topicIdentityPass
    ? "mismatch"
    : titleHasKeyword ? "aligned" : "title_only_missing";

  const signal = (pass: boolean, score: number, evidence: string[], mismatch: string): OpportunityAlignmentSignal => Object.freeze({
    pass,
    score: pass ? Math.max(85, Math.round(score)) : Math.min(84, Math.round(score)),
    evidence: Object.freeze(evidence),
    ...(pass ? {} : { detectedMismatch: mismatch, blockingReason: mismatch }),
    correctionApplied: false,
  });
  const topicFidelity = signal(topicIdentityPass, Math.min(topicKeywordCoverage, Math.max(titleCoreCoverage, bodyCoreCoverage)) * 100, [
    `선정 주제: ${opportunity.selectedTopic}`,
    `대표 키워드의 선정 주제 반영률: ${percent(topicKeywordCoverage)}`,
    `본문 핵심어 반영률: ${percent(bodyCoreCoverage)}`,
  ], "선정 주제와 대표 키워드의 핵심 개념이 제목과 본문 중심 내용에 함께 반영되지 않았습니다.");
  const primaryKeywordAlignment = signal(bodyPass, bodyHasKeyword ? 100 : bodyCoreCoverage * 100, [
    `대표 키워드: ${opportunity.primaryKeyword}`,
    `본문 대표 키워드/핵심어 반영: ${bodyHasKeyword ? "직접 확인" : percent(bodyCoreCoverage)}`,
  ], "본문이 확정 대표 키워드의 질문을 중심적으로 다루지 않습니다.");
  const searchIntentFulfillment = signal(intentPass, intentScore, [
    `검색 의도: ${opportunity.searchIntent}`,
    `의도 요구사항 충분: ${intentSufficient.length}/${intentDiagnostics.length}`,
    `의도 요구사항 언급: ${intentMentioned.length}/${intentDiagnostics.length}`,
    `의도 요구사항 누락: ${intentMissing.length}/${intentDiagnostics.length}`,
    ...intentDiagnostics.map((item) => `${item.status}: ${item.requirement}`),
  ], "원고가 확정된 검색 의도의 독자 질문과 실행 목표를 충분히 해결하지 않습니다.");
  const secondaryKeywordSupport = signal(secondaryPass, opportunity.secondaryKeywords.length ? supportedSecondary.length / opportunity.secondaryKeywords.length * 100 : 100, [
    `본문에서 확인된 보조 키워드: ${supportedSecondary.join(", ") || "없음"}`,
  ], "확정된 보조 키워드 대부분이 실제 원고에서 뒷받침되지 않습니다.");
  const titleTopicAlignment = signal(titleTopicPass, Math.max(titleCoreCoverage * 100, titleHasKeyword ? 100 : 0), [
    `제목: ${document.title}`,
    `제목 핵심어 반영률: ${percent(titleCoreCoverage)}`,
  ], "제목이 확정된 주제와 다른 방향을 가리킵니다.");
  const headingCoverageSignal = signal(headingPass, headingCoreCoverage * 100, [`H2/H3 핵심어 반영률: ${percent(headingCoreCoverage)}`], "목차가 확정된 주제의 핵심 범위를 구성하지 않습니다.");
  const bodyCoverageSignal = signal(bodyPass && expectedPass, Math.min(bodyHasKeyword ? 1 : bodyCoreCoverage, expectedPass ? 1 : expectedCoverage.length / Math.max(1, opportunity.expectedCoverage.length)) * 100, [
    `본문 핵심어 반영률: ${percent(bodyCoreCoverage)}`,
    `예상 범위 반영: ${expectedCoverage.length}/${opportunity.expectedCoverage.length}`,
  ], "본문의 핵심 내용이 선택한 Content Opportunity의 예상 범위를 충족하지 않습니다.");
  const consistency = signal(topicIdentityPass, topicIdentityPass ? 100 : 0, [
    `Opportunity: ${opportunity.opportunityId}@${opportunity.version}`,
    `fingerprint: ${opportunity.fingerprint}`,
  ], "주제·대표 키워드·제목·본문 사이에 Content Opportunity 정체성 불일치가 있습니다.");
  const crossTopicDrift = signal(topicIdentityPass, topicIdentityPass ? 100 : 20, [
    topicIdentityPass ? "제목과 본문 중심 주제가 확정 Opportunity를 따릅니다." : "확정 Opportunity 핵심어보다 다른 주제가 우세할 가능성이 있습니다.",
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
    alignment: Object.freeze({ ...nextAlignment, review: markCorrection(nextAlignment.review) }),
  });
}

function intentRequirements(opportunity: ConfirmedContentOpportunity): readonly string[] {
  const readerProblem = opportunity.readerProblem.trim();
  const qualityTarget = normalizeContentPlanQualityTarget(opportunity.qualityTarget, {
    searchIntent: opportunity.searchIntent,
    contentType: opportunity.contentType,
    readerProblem: opportunity.readerProblem,
    audience: opportunity.audience,
    selectedTopic: opportunity.selectedTopic,
    expectedCoverage: opportunity.expectedCoverage,
  });
  const planned = [
    readerProblem,
    ...qualityTarget.coreQuestions.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
    ...qualityTarget.actionableNextSteps.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
  ].map((item) => item.trim()).filter(Boolean);
  const unique: string[] = [];
  for (const requirement of (planned.length ? planned : [opportunity.searchIntent.trim()].filter(Boolean))) {
    if (unique.some((existing) => sameIntentRequirement(existing, requirement))) continue;
    unique.push(requirement);
  }
  return Object.freeze(unique);
}

function isGenericIntentRequirement(value: string, readerProblem: string): boolean {
  const normalized = normalize(value);
  const normalizedProblem = normalize(readerProblem);
  if (normalizedProblem && normalized.startsWith(normalizedProblem) && /직접 답은 무엇인가$/.test(normalized)) return true;
  return normalized === "독자가 이해하거나 실행하기 위해 반드시 알아야 할 것은 무엇인가"
    || normalized === "독자가 콘텐츠를 읽은 뒤 실행할 다음 행동";
}

function sameIntentRequirement(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return normalizedLeft === normalizedRight;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
  const leftTerms = intentConceptTerms(left);
  const rightTerms = intentConceptTerms(right);
  const denominator = Math.min(leftTerms.length, rightTerms.length);
  if (!denominator) return false;
  const overlap = leftTerms.filter((term) => rightTerms.some((candidate) => candidate.includes(term) || term.includes(candidate))).length;
  return overlap / denominator >= 0.8;
}

function intentRequirementStatus(requirement: string, document: ContentDocument): InformationSufficiencyStatus {
  const normalizedRequirement = normalize(requirement);
  const terms = intentConceptTerms(requirement);
  const sections = contentSections(document);
  const fullText = normalizeStructuredText(document.blocks.flatMap((block) => { const text = readableIntentBlockText(block); return text ? [text] : []; }).join("\n"));
  const fullCoverage = conceptCoverage(terms, fullText);
  const semanticWhole = semanticIntentSignal(requirement, fullText);
  const sectionDiagnostics = sections.map((section) => Object.freeze({
    ...section,
    coverage: conceptCoverage(terms, section.text),
    directMatch: Boolean(normalizedRequirement && normalize(section.text).includes(normalizedRequirement)),
    semanticMatch: semanticIntentSignal(requirement, section.text),
  }));
  const matching = sectionDiagnostics.filter((section) => section.directMatch || section.coverage >= 0.5 || section.semanticMatch);
  const matchingInformationElements = matching.reduce((sum, section) => sum + section.informationElements, 0);
  const documentInformationElements = sectionDiagnostics.reduce((sum, section) => sum + section.informationElements, 0);
  const distributedEvidenceSections = sectionDiagnostics.filter((section) => section.coverage >= 0.2 || section.semanticMatch).length;
  const documentWideSufficient = fullCoverage >= 0.34
    && documentInformationElements >= 3
    && distributedEvidenceSections >= 2;
  if (matchingInformationElements >= 2 || documentWideSufficient) return "sufficient";
  return matching.length || fullCoverage >= 0.34 || semanticWhole ? "mentioned" : "missing";
}

function contentSections(document: ContentDocument): readonly Readonly<{ text: string; informationElements: number }>[] {
  const sections: Array<{ text: string; informationElements: number }> = [];
  let heading = "";
  let texts: string[] = [];
  const flush = () => {
    const text = normalizeStructuredText([heading, ...texts].filter(Boolean).join("\n"));
    if (!text) return;
    sections.push({ text, informationElements: informationElements(text) });
  };
  for (const block of document.blocks) {
    if (block.type === "heading" && block.level === 2) {
      flush();
      heading = block.text;
      texts = [];
    } else if (block.type === "paragraph") {
      texts.push(block.text);
    } else {
      const text = readableIntentBlockText(block);
      if (text) texts.push(text);
    }
  }
  flush();
  return Object.freeze(sections.map((section) => Object.freeze(section)));
}

const freeVisualPurposes = new Set(["comparison", "checklist", "infographic", "summary", "warning"]);

function readableIntentBlockText(block: ContentBlock): string {
  if (block.type === "heading" || block.type === "paragraph") return block.text;
  if (block.type === "table") return serializeStructuredTable(block);
  if (block.type === "image" && !block.source.trim() && block.purpose && freeVisualPurposes.has(block.purpose)) {
    return [block.alt, block.caption ?? ""].filter(Boolean).join("\n");
  }
  return "";
}

function informationElements(text: string): number {
  const prose = normalizeStructuredText(text)
    .split(/(?:[.!?。！？]+|\n+)/)
    .filter((item) => item.trim().length >= 10).length;
  return prose + structuredListItems(text).length + structuredTableCount(text) * 3;
}

function semanticIntentSignal(requirement: string, text: string): boolean {
  const requirementValue = normalize(requirement);
  const textValue = normalizeStructuredText(text);
  const signals = [
    /횟수|빈도|몇 번|반복/.test(requirementValue) && /\d+\s*(?:회|번|세트)|반복|빈도|간격/.test(textValue),
    /순서|단계|다음 행동|어떻게/.test(requirementValue) && /먼저|다음(?:으로)?|마지막(?:으로)?|\d+[.)]\s+/.test(textValue),
    /기준|판단|구분|확인/.test(requirementValue) && /기준|조건|경우|확인|중단/.test(textValue),
    /주의|예외|위험|피해야/.test(requirementValue) && /주의|예외|위험|중단|상담|피해야/.test(textValue),
    /기록|비교/.test(requirementValue) && /기록|메모|표|비교|추세/.test(textValue),
    /방법|자세|측정|실행|적용/.test(requirementValue) && /방법|자세|측정|실행|적용|해야/.test(textValue),
  ];
  return signals.some(Boolean);
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

function conceptCoverage(terms: readonly string[], value: string): number {
  if (!terms.length) return 0;
  const candidates = intentConceptTerms(value);
  return terms.filter((term) => candidates.some((candidate) => candidate.includes(term) || term.includes(candidate))).length / terms.length;
}

function distinctiveTerms(value: string): string[] {
  const ignored = new Set(["가이드", "관리", "방법", "작성법", "정보", "글", "콘텐츠", "위한", "대한", "관련", "사용자", "독자", "탐색", "의도", "알기", "이해", "실천"]);
  return [...new Set(normalize(value).split(/\s+/).map(koreanStem).map(alignmentTerm).filter((term) => term && !ignored.has(term)))];
}

export function contentIntentTerms(value: string): string[] {
  return intentConceptTerms(value);
}

function intentConceptTerms(value: string): string[] {
  const ignored = new Set([
    "가이드", "관리", "정보", "정보형", "정보성", "실행형", "실행성", "비교형", "구매형", "상업형", "탐색형",
    "글", "콘텐츠", "위한", "대한", "관련", "사용자", "독자", "탐색", "의도", "알기", "알고", "이해", "싶어", "싶은",
    "어떤", "어떻게", "직접", "원하는", "찾는", "찾고", "확인", "확인할", "올바른", "정확한", "다음", "행동",
    "informational", "information", "transactional", "commercial", "navigational", "comparison",
  ]);
  return [...new Set(normalize(value).split(/\s+/)
    .map(stripParticle)
    .filter((term) => term.length >= 2 && !ignored.has(term)))];
}

function koreanStem(value: string): string {
  if (!/[가-힣]/.test(value) || value.length < 2) return value;
  if (/^(?:하는|하기|하며|하고|하려는|하려고|하려면|알고|위한|대한)$/u.test(value)) return "";
  const verbSuffixes = ["해보려는", "해보려고", "해보려면", "하려는", "하려고", "하려면", "하는지", "할지", "하기를", "하면서", "하고", "하며", "하는", "하기", "해서", "되는", "되어", "이다", "이며"];
  for (const suffix of verbSuffixes) if (value.endsWith(suffix) && value.length - suffix.length >= 2) return value.slice(0, -suffix.length);
  return stripParticle(value);
}

function stripParticle(value: string): string {
  const suffixes = ["으로는", "에서는", "에게는", "까지는", "부터는", "으로", "에서", "에게", "까지", "부터", "처럼", "보다", "들을", "을", "를", "은", "는", "이", "가", "의", "에", "도", "와", "과"];
  for (const suffix of suffixes) if (value.endsWith(suffix) && value.length - suffix.length >= 1) return value.slice(0, -suffix.length);
  return value;
}

function normalize(value: string): string {
  return normalizeStructuredText(value).toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣\s]/g, " ").replace(/\s+/g, " ").trim();
}
function alignmentTerm(value: string): string { return /^(?:기록지|기록장|일지|노트)$/u.test(value) ? "기록" : value; }
function percent(value: number): string { return `${Math.round(value * 100)}%`; }
