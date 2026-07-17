import { calculateContentMetrics, canonicalDocumentText, type ContentDocument } from "../content";
import { contentLengthProfile, qualityDimensionWeights } from "./QualityScoringPolicy";

export type QualityCategory = "searchIntent" | "seo" | "readability" | "structure" | "completeness" | "usefulness" | "htmlQuality" | "imageStrategy" | "internalLinks" | "cta";
export type QualityDimensionStatus = "ready" | "needs_improvement" | "blocked";
export type QualityEvidence = Readonly<{ signal: string; value: string | number | boolean }>;
export type QualityDimensionResult = Readonly<{
  category: QualityCategory;
  score: number;
  status: QualityDimensionStatus;
  evaluation: "evaluated" | "not_evaluated";
  reasons: readonly string[];
  tasks: readonly string[];
  evidence: readonly QualityEvidence[];
}>;
export type QualityFinding = Readonly<{ category: QualityCategory; message: string; severity: "error" | "warning" | "info" }>;
export type QualityReviewContext = Readonly<{ contentType?: string; platform?: string; primaryKeyword?: string; searchIntent?: string; revisionId?: string; reviewedAt?: string }>;
export type QualityReport = Readonly<{
  approved: boolean;
  approvalState: "approved" | "improvement_required" | "blocked";
  findings: readonly QualityFinding[];
  overallScore: number;
  reviews: readonly QualityDimensionResult[];
  dimensions: readonly QualityDimensionResult[];
  tasks: readonly Readonly<{ category: QualityCategory; message: string; status: "action_required" | "blocked" }>[];
  reviewedAt: string;
  reviewedRevisionId: string;
  weights: Readonly<Record<QualityCategory, number>>;
}>;

export class QualityEngine {
  review(document: ContentDocument, context: QualityReviewContext = {}): QualityReport {
    const signals = measure(document, context);
    const dimensions = evaluate(signals);
    const overallScore = Math.round(dimensions.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0) / 100);
    const blocked = dimensions.some((item) => item.status === "blocked");
    const editorialTargets = new Set<QualityCategory>(["searchIntent", "seo", "readability", "completeness"]);
    const approved = overallScore >= 95 && !blocked && dimensions.every((item) => item.score >= (editorialTargets.has(item.category) ? 95 : 80));
    const findings = dimensions.flatMap((item) => item.reasons.map((message) => ({ category: item.category, message, severity: item.status === "blocked" ? "error" as const : "warning" as const })));
    return Object.freeze({
      approved,
      approvalState: approved ? "approved" : blocked ? "blocked" : "improvement_required",
      findings: Object.freeze(findings),
      overallScore,
      reviews: Object.freeze(dimensions),
      dimensions: Object.freeze(dimensions),
      tasks: Object.freeze(dimensions.flatMap((item) => item.tasks.map((message) => ({ category: item.category, message, status: item.status === "blocked" ? "blocked" as const : "action_required" as const })))),
      reviewedAt: context.reviewedAt ?? new Date().toISOString(),
      reviewedRevisionId: context.revisionId ?? contentRevisionId(document),
      weights: qualityDimensionWeights,
    });
  }
}

export class PublishingGate {
  assertReady(report: QualityReport, currentRevisionId?: string): void {
    if (currentRevisionId && report.reviewedRevisionId !== currentRevisionId) throw new Error("Publishing blocked: Quality Review is stale for the current content revision.");
    if (!report.approved) throw new Error(`Publishing blocked: quality score ${report.overallScore}.`);
  }
}

export function contentRevisionId(document: ContentDocument): string {
  const source = JSON.stringify({ title: document.title, blocks: document.blocks });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `rev-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

type Signals = ReturnType<typeof measure>;
function measure(document: ContentDocument, context: QualityReviewContext) {
  const text = canonicalDocumentText(document), metrics = calculateContentMetrics(document);
  const paragraphs = document.blocks.filter((block) => block.type === "paragraph");
  const headings = document.blocks.filter((block) => block.type === "heading");
  const buttons = document.blocks.filter((block) => block.type === "button");
  const images = document.blocks.filter((block) => block.type === "image");
  const normalized = text.toLowerCase();
  const planningPattern = /(?:작성할|다룰 예정|추가 예정|초안 지시|기획안|아웃라인|목차를 구성|will (?:write|cover|discuss)|to be written|placeholder|todo|tbd|insert .+ here)/i;
  const placeholderPattern = /(?:lorem ipsum|내용을 입력|여기에 .+ 입력|예시 문구|placeholder|todo|tbd)/i;
  const headingNames = headings.map((item) => item.text.trim().toLowerCase()).filter(Boolean);
  const duplicateHeadingCount = headingNames.length - new Set(headingNames).size;
  const keyword = context.primaryKeyword?.trim().toLowerCase() ?? "";
  const keywordOccurrences = keyword ? normalized.split(keyword).length - 1 : 0;
  const profile = contentLengthProfile(context.contentType, context.platform);
  const paragraphSentenceCounts = paragraphs.map((item) => sentenceCount(item.text));
  const shortParagraphs = paragraphs.filter((item, index) => item.text.trim().length < 70 || paragraphSentenceCounts[index] < 2).length;
  const repeatedOpenings = paragraphs.map((item) => item.text.trim().slice(0, 18)).filter((value) => value.length >= 8).length - new Set(paragraphs.map((item) => item.text.trim().slice(0, 18)).filter((value) => value.length >= 8)).size;
  const clicheCount = matches(text, /(?:알아보겠습니다|살펴보겠습니다|중요합니다|도움이 됩니다|필수적입니다)/g);
  const experienceClaim = /(?:제가|나는|저는|직접)\s*.{0,24}(?:경험했|겪었|사용했|먹어봤|해봤)/i.test(text);
  const sections = sectionDepth(document);
  const shallowSections = sections.filter((section) => section.characters < 350).length;
  const metaDescription = document.metadata?.metaDescription?.trim() ?? "";
  return { document, context, text, metrics, paragraphs, headings, buttons, images, planning: planningPattern.test(text), placeholders: placeholderPattern.test(text), duplicateHeadingCount, emptyHeadings: headings.filter((item) => !item.text.trim()).length, keyword, keywordOccurrences, profile, shortParagraphs, repeatedOpenings, clicheCount, experienceClaim, sections, shallowSections, metaDescription };
}

function evaluate(s: Signals): QualityDimensionResult[] {
  const intro = s.paragraphs[0]?.text.trim() ?? "", conclusion = s.paragraphs.at(-1)?.text.trim() ?? "";
  const contextualInternalLinks = s.buttons.filter((item) => item.purpose === "internal_link" && isPublicContentUrl(item.targetUrl, s.context.platform));
  const relatedPosts = s.buttons.filter((item) => item.purpose === "related_post" && isPublicContentUrl(item.targetUrl, s.context.platform));
  const ctaButtons = s.buttons.filter((item) => (item.purpose === "cta" || (!item.purpose && !item.targetUrl.startsWith("/"))) && Boolean(item.targetUrl.trim()));
  const externalClaims = /(?:\d+(?:\.\d+)?%|연구에 따르면|통계에 따르면|according to (?:research|a study))/i.test(s.text);
  const hasCitation = /https?:\/\/|출처|참고문헌|source:/i.test(s.text);
  const lengthRatio = Math.min(1, s.metrics.charactersWithoutSpaces / s.profile.targetCharacters);
  const depthScore = clamp(Math.round(lengthRatio * 65 + Math.min(35, s.paragraphs.length * 4)));
  const keywordDensity = s.keyword && s.metrics.wordUnits ? s.keywordOccurrences / s.metrics.wordUnits : 0;
  const invalidHeadingOrder = s.headings.some((heading, index) => index > 0 && heading.level > s.headings[index - 1].level + 1);
  const intentTerms = meaningfulTerms(s.context.searchIntent ?? "");
  const reflectedIntentTerms = intentTerms.filter((term) => s.text.toLowerCase().includes(term)).length;
  const intentMetadata = Boolean(s.document.metadata?.primarySearchIntent?.trim());
  const searchIntentScore = !s.context.searchIntent ? 0 : intentMetadata && intro.length >= 80 && depthScore >= 85 ? 100 : reflectedIntentTerms >= Math.min(3, intentTerms.length) && intro.length >= 80 ? 95 : 68;
  const imageStrategyComplete = s.images.length > 0 && s.images.every((item) => item.alt.trim().length >= 4);
  const internalLinkScore = contextualInternalLinks.length > 0 && relatedPosts.length >= 3 ? 100 : contextualInternalLinks.length > 0 ? 55 + Math.min(20, relatedPosts.length * 10) : 10 + Math.min(30, relatedPosts.length * 10);
  const internalLinkReasons = [
    ...(contextualInternalLinks.length ? [] : ["본문 중간에 실제 URL이 있는 내부 링크가 없습니다."]),
    ...(relatedPosts.length >= 3 ? [] : ["실제 관련 글 링크가 3개보다 적습니다."]),
  ];

  return [
    dimension("searchIntent", searchIntentScore,
      !s.context.searchIntent ? ["확정된 검색 의도 정보가 없어 평가할 수 없습니다."] : searchIntentScore >= 85 ? [] : ["도입부와 주요 섹션이 확정된 검색 의도를 충분히 해결하지 못합니다."], s.context.searchIntent ? ["도입부와 주요 섹션에서 독자의 검색 목적을 직접 해결하세요."] : ["콘텐츠 기획의 검색 의도를 저장한 뒤 다시 검토하세요."], [{ signal: "confirmedSearchIntent", value: s.context.searchIntent ?? false }, { signal: "reflectedIntentTerms", value: reflectedIntentTerms }, { signal: "intentMetadata", value: intentMetadata }], s.context.searchIntent ? "evaluated" : "blocked"),
    dimension("seo", s.keyword ? clamp(55 + (s.document.title.toLowerCase().includes(s.keyword) ? 20 : 0) + (s.keywordOccurrences > 0 ? 15 : 0) + (s.metaDescription.length >= 60 && s.metaDescription.length <= 180 ? 10 : 0) - (keywordDensity > 0.08 || s.keywordOccurrences > 15 ? 35 : 0)) : 35 + (s.metaDescription ? 10 : 0),
      [...(keywordDensity > 0.08 || s.keywordOccurrences > 15 ? ["핵심 키워드가 지나치게 반복됩니다."] : []), ...(s.keyword && !s.document.title.toLowerCase().includes(s.keyword) ? ["제목이 핵심 키워드를 명확히 반영하지 않습니다."] : []), ...(!s.metaDescription ? ["실제 본문을 요약한 메타디스크립션이 없습니다."] : []), ...(s.metaDescription && (s.metaDescription.length < 60 || s.metaDescription.length > 180) ? ["메타디스크립션이 핵심 내용을 충분히 설명하지 못하거나 지나치게 깁니다."] : [])], ["제목·메타디스크립션·본문에 핵심 키워드를 자연스럽게 배치하고 반복을 줄이세요."], [{ signal: "keywordOccurrences", value: s.keywordOccurrences }, { signal: "keywordDensity", value: Number(keywordDensity.toFixed(3)) }, { signal: "metaDescriptionLength", value: s.metaDescription.length }]),
    dimension("readability", clamp(100 - (s.paragraphs.some((item) => item.text.length > 500) ? 15 : 0) - Math.min(30, s.shortParagraphs * 3) - Math.min(15, s.repeatedOpenings * 5) - Math.min(20, s.clicheCount * 4)),
      [...(s.paragraphs.some((item) => item.text.length > 500) ? ["지나치게 긴 문단이 있어 읽기 어렵습니다."] : []), ...(s.shortParagraphs > Math.max(2, Math.floor(s.paragraphs.length * 0.25)) ? ["짧은 한 문장 문단이 반복되어 흐름이 끊깁니다."] : []), ...(s.clicheCount ? ["상투적인 AI 표현이 반복됩니다."] : [])], ["문단을 2~5개의 연결된 문장으로 구성하고 반복되는 도입 표현을 제거하세요."], [{ signal: "paragraphCount", value: s.metrics.paragraphCount }, { signal: "shortParagraphs", value: s.shortParagraphs }, { signal: "repeatedOpenings", value: s.repeatedOpenings }, { signal: "clicheCount", value: s.clicheCount }]),
    dimension("structure", clamp(100 - (intro.length < 100 ? 20 : 0) - (s.headings.length < s.profile.minimumSections ? 25 : 0) - s.duplicateHeadingCount * 15 - s.emptyHeadings * 20 - (invalidHeadingOrder ? 20 : 0) - Math.min(30, s.shallowSections * 10)),
      [...(intro.length < 100 ? ["게시글 도입부가 없거나 너무 짧습니다."] : []), ...(s.headings.length < s.profile.minimumSections ? ["콘텐츠 유형에 필요한 구조화된 섹션이 부족합니다."] : []), ...(s.duplicateHeadingCount || s.emptyHeadings ? ["비어 있거나 중복된 제목이 있습니다."] : []), ...(s.shallowSections ? ["설명이 얕은 주요 섹션이 있습니다."] : [])], ["독자의 문제를 여는 도입부와 충분한 설명이 있는 서로 다른 소제목 섹션을 작성하세요."], [{ signal: "headingCount", value: s.metrics.headingCount }, { signal: "requiredSections", value: s.profile.minimumSections }, { signal: "shallowSections", value: s.shallowSections }]),
    dimension("completeness", clamp(depthScore - (s.planning ? 45 : 0) - (intro.length < 80 ? 10 : 0) - (conclusion.length < 100 ? 15 : 0)),
      [...(s.planning ? ["완성된 글이 아니라 작성 계획이나 지시문이 본문에 포함되어 있습니다."] : []), ...(s.metrics.charactersWithoutSpaces < s.profile.minimumCharacters ? ["선택한 콘텐츠 유형에 비해 본문 설명이 부족합니다."] : []), ...(conclusion.length < 100 ? ["핵심 내용을 정리하는 결론이 부족합니다."] : [])], ["계획 문구를 실제 설명으로 바꾸고 각 섹션의 근거·예시·결론을 완성하세요."], [{ signal: "characters", value: s.metrics.charactersWithoutSpaces }, { signal: "minimumCharacters", value: s.profile.minimumCharacters }, { signal: "planningLanguageDetected", value: s.planning }]),
    dimension("usefulness", clamp(depthScore - (s.placeholders ? 40 : 0) - (externalClaims && !hasCitation ? 25 : 0) - (s.experienceClaim ? 30 : 0) - Math.min(25, s.shallowSections * 8)),
      [...(s.placeholders ? ["placeholder 또는 작성 지시 문구가 남아 있습니다."] : []), ...(externalClaims && !hasCitation ? ["수치나 연구 주장을 뒷받침하는 출처를 확인할 수 없습니다."] : []), ...(s.experienceClaim ? ["사용자가 제공하지 않은 개인 경험처럼 보이는 표현이 있습니다."] : []), ...(s.shallowSections ? ["주요 섹션에 실행 가능한 기준과 구체적인 설명이 부족합니다."] : [])], ["독자가 실행할 수 있는 기준·방법·예시·주의사항과 검증 가능한 근거를 추가하세요."], [{ signal: "placeholderDetected", value: s.placeholders }, { signal: "unsupportedClaimSignal", value: externalClaims && !hasCitation }, { signal: "fabricatedExperienceRisk", value: s.experienceClaim }, { signal: "shallowSections", value: s.shallowSections }], externalClaims && !hasCitation || s.experienceClaim ? "blocked" : "evaluated"),
    dimension("htmlQuality", clamp(100 - s.emptyHeadings * 30 - s.duplicateHeadingCount * 15 - (invalidHeadingOrder ? 25 : 0) - (s.document.blocks.length ? 0 : 100)),
      [...(!s.document.blocks.length ? ["렌더링할 canonical block이 없습니다."] : []), ...(invalidHeadingOrder ? ["제목 단계가 건너뛰어 HTML 문서 구조가 올바르지 않습니다."] : [])], ["빈 블록을 제거하고 제목 단계를 순서대로 정리하세요."], [{ signal: "blockCount", value: s.document.blocks.length }, { signal: "headingHierarchyValid", value: !invalidHeadingOrder }]),
    dimension("imageStrategy", imageStrategyComplete ? 100 : s.images.length ? 60 : 35,
      imageStrategyComplete ? [] : s.images.length ? ["이미지 추천 블록의 설명 텍스트가 부족합니다."] : ["본문에 이미지 전략 블록이 없습니다."], ["본문 흐름에 맞는 이미지 placeholder와 구체적인 ALT 설명을 배치하세요."], [{ signal: "recommendedImageBlocks", value: s.images.length }, { signal: "descriptiveImageBlocks", value: s.images.filter((item) => item.alt.trim().length >= 4).length }, { signal: "uploadedImageBlocks", value: s.images.filter((item) => Boolean(item.source.trim())).length }]),
    dimension("internalLinks", internalLinkScore,
      internalLinkReasons, ["관련 섹션 뒤에 실제 URL이 있는 내부 링크 1개를 배치하고 문서 마지막에 실제 URL이 있는 관련 글 3개를 연결하세요."], [{ signal: "placedContextualInternalLinks", value: contextualInternalLinks.length }, { signal: "placedRelatedPosts", value: relatedPosts.length }]),
    dimension("cta", 100,
      [], [], [{ signal: "placedCtaBlocks", value: ctaButtons.length }, { signal: "requiredForTopic", value: ctaButtons.length > 0 }], ctaButtons.length ? "evaluated" : "optional"),
  ];
}
function isPublicContentUrl(value: string, platform?: string): boolean { try { const url = new URL(value); if (url.protocol !== "https:" || /\/manage(?:\/|$)/i.test(url.pathname)) return false; return platform === "tistory" ? /\.tistory\.com$/i.test(url.hostname) && url.pathname.startsWith("/entry/") : true; } catch { return false; } }

function dimension(category: QualityCategory, score: number, reasons: string[], tasks: string[], evidence: QualityEvidence[], evaluation: "evaluated" | "blocked" | "optional" = "evaluated"): QualityDimensionResult {
  const normalized = clamp(Math.round(score));
  const status: QualityDimensionStatus = evaluation === "blocked" ? "blocked" : normalized >= 85 ? "ready" : "needs_improvement";
  return Object.freeze({ category, score: evaluation === "blocked" ? 0 : normalized, status, evaluation: evaluation === "evaluated" ? "evaluated" : "not_evaluated", reasons: Object.freeze(reasons.length ? reasons : normalized >= 85 ? [] : ["현재 측정값이 게시 준비 기준에 미치지 못합니다."]), tasks: Object.freeze(status === "ready" ? [] : tasks), evidence: Object.freeze(evidence) });
}
function clamp(value: number) { return Math.max(0, Math.min(100, value)); }
function meaningfulTerms(value: string) { return [...new Set(value.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term.length >= 2 && !/^(정보형|정보성|사용자|의도|문제|해결|탐색)$/.test(term)))]; }
function sentenceCount(value: string) {
  return value
    .split(/(?:[.!?。！？]+|습니다|합니다|됩니다|있습니다|없습니다|입니다|세요|해요|돼요|나요|죠)\s*/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}
function matches(value: string, pattern: RegExp) { return [...value.matchAll(pattern)].length; }
function sectionDepth(document: ContentDocument) {
  const sections: { heading: string; characters: number }[] = [];
  let current: { heading: string; characters: number } | undefined;
  for (const block of document.blocks) {
    if (block.type === "heading" && block.level === 2) { current = { heading: block.text, characters: 0 }; sections.push(current); }
    else if (current && block.type === "paragraph") current.characters += block.text.replace(/\s/g, "").length;
  }
  return sections;
}
