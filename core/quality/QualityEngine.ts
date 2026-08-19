import {
  analyzeContentOpportunityAlignment,
  analyzeLongFormDocument,
  calculateContentMetrics,
  longFormNarrativeFloors,
  canonicalDocumentText,
  normalizeSeoKeyword,
  isSystemProjectionBlock,
  titleContainsPrimaryKeyword,
  deriveContentTags,
  requiresLongFormValidation,
  type ContentPlanQualityTarget,
  type ConfirmedContentOpportunity,
  type ContentDocument,
  type ContentOpportunityQualityReview,
} from "../content";
import { analyzeImagePrompts, isBrightComponentPurpose, type ImagePromptIssue } from "../media";
import { qualityDimensionWeights } from "./QualityScoringPolicy";

/**
 * 어절 20개는 한국어 한 문장이 한 호흡에 읽히는 경계이고, 그런 문장이 넷 중 하나를
 * 넘으면 글 전체가 무겁게 읽힌다.
 *
 * 값은 Yoast에서 따왔지만 측정은 우리가 해야 한다. 2026-08-14 확인: Yoast의 문장
 * 분리기는 마침표 뒤에 대문자가 와야 문장을 끊는다. 한국어에는 대문자가 없어 한 번도
 * 끊기지 않고, 문단 하나가 통째로 "문장 하나"로 계산된다 — 43어절 4문장 문단이 그대로
 * 한 문장이었다. 그래서 Yoast의 문장 길이 지적은 한국어에서 문장이 아니라 문단 길이를
 * 가리키며, 문장을 아무리 나눠도 숫자가 움직이지 않는다. 여기서 재는 것이 실제 문장
 * 길이다.
 */
const longSentenceWordLimit = 20;
const longSentenceRatioLimit = 0.25;

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
export type QualityReviewContext = Readonly<{ contentType?: string; platform?: string; primaryKeyword?: string; searchIntent?: string; categoryName?: string; availableInternalLinkCandidates?: number; internalLinkCatalogStatus?: "evaluated" | "category_missing" | "catalog_unavailable"; qualityTarget?: ContentPlanQualityTarget; opportunity?: ConfirmedContentOpportunity; revisionId?: string; reviewedAt?: string }>;
export type QualityApprovalType = "standard" | "exception" | "none";
export type QualityReport = Readonly<{
  approved: boolean;
  approvalType?: QualityApprovalType;
  approvalState: "approved" | "improvement_required" | "blocked";
  findings: readonly QualityFinding[];
  overallScore: number;
  opportunityReview?: ContentOpportunityQualityReview;
  reviews: readonly QualityDimensionResult[];
  dimensions: readonly QualityDimensionResult[];
  tasks: readonly Readonly<{ category: QualityCategory; message: string; status: "action_required" | "blocked" }>[];
  reviewedAt: string;
  reviewedRevisionId: string;
  weights: Readonly<Record<QualityCategory, number>>;
}>;

export function isStandardQualityApproved(report: Pick<QualityReport, "approved" | "approvalType"> | undefined): boolean {
  return report?.approved === true && report.approvalType === "standard";
}


export function resolveQualityApproval(
  overallScore: number,
  dimensions: readonly Pick<QualityDimensionResult, "category" | "score">[],
  integrityPassed: boolean,
  editorialTargets: ReadonlySet<QualityCategory> = new Set<QualityCategory>(["searchIntent", "seo", "readability", "completeness"]),
): Readonly<{ approved: boolean; approvalType: QualityApprovalType }> {
  const scoringDimensions = dimensions.filter((item) => qualityDimensionWeights[item.category] > 0);
  const standardApproved = integrityPassed
    && overallScore >= 95
    && scoringDimensions.every((item) => item.score >= (editorialTargets.has(item.category) ? 95 : 80));
  const exceptionApproved = !standardApproved
    && integrityPassed
    && overallScore >= 90
    && scoringDimensions.every((item) => item.score >= (editorialTargets.has(item.category) ? 90 : 80));
  return Object.freeze({
    approved: standardApproved || exceptionApproved,
    approvalType: standardApproved ? "standard" : exceptionApproved ? "exception" : "none",
  });
}

export class QualityEngine {
  review(document: ContentDocument, context: QualityReviewContext = {}): QualityReport {
    const signals = measure(document, context);
    const dimensions = evaluate(signals);
    const scoringWeight = Object.values(qualityDimensionWeights).reduce((sum, weight) => sum + weight, 0);
    const overallScore = Math.round(dimensions.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0) / scoringWeight);
    const blocked = dimensions.some((item) => item.status === "blocked");
    const opportunityReview = signals.opportunityAlignment?.review;
    /**
     * 차단은 글 전체 분량 하나로 옮긴다.
     *
     * 위반 1건이면 탈락이었다. 그래서 5,074자 원고가 한 섹션 10자 부족으로
     * 막혔고, 비교표를 약속했다가 산문으로 설명한 글도 같이 막혔다. 섹션 균형과
     * 표 유무는 글의 완성도를 가르는 선이 아니다 — 애드센스가 거부하는 것은
     * 얕은 글이다. 나머지 위반은 진단과 최종 편집 지시로 계속 전달되므로
     * 사라지지 않는다.
     *
     * 승인 준비 원고에만 적용한다. 일반 Content 의 통과 조건은 품질 점수뿐이고
     * (D-045), 분량은 기획이 정한 목표에 따라 짧을 수 있다.
     */
    const contentTargetBlocked = Boolean(document.metadata?.approvalPolicy)
      && signals.hasExplicitQualityTarget
      && signals.contentDiagnostic.narrativeCharacters < longFormNarrativeFloors.article;
    const opportunityBlocked = opportunityReview ? !opportunityReview.pass : false;
    const evidenceClaimTasks = signals.unsupportedEvidenceClaims.map((message) => ({ category: "searchIntent" as const, message, status: "blocked" as const }));
    const editorialTargets = new Set<QualityCategory>(["searchIntent", "seo", "readability", "completeness"]);
    const integrityPassed = !blocked && !opportunityBlocked && !contentTargetBlocked && evidenceClaimTasks.length === 0;
    const { approved, approvalType } = resolveQualityApproval(overallScore, dimensions, integrityPassed, editorialTargets);
    const opportunityTasks = opportunityReview ? opportunitySignals(opportunityReview)
      .filter((item) => !item.signal.pass)
      .map((item) => ({ category: "searchIntent" as const, message: `${item.label}: ${item.signal.blockingReason ?? item.signal.detectedMismatch ?? "Content Opportunity와 원고가 일치하지 않습니다."}`, status: "blocked" as const })) : [];
    const findings = [
      ...dimensions.flatMap((item) => item.reasons.map((message) => ({ category: item.category, message, severity: item.status === "blocked" ? "error" as const : "warning" as const }))),
      ...opportunityTasks.map((item) => ({ category: item.category, message: item.message, severity: "error" as const })),
      ...evidenceClaimTasks.map((item) => ({ category: item.category, message: item.message, severity: "error" as const })),
      ...(signals.hasExplicitQualityTarget ? signals.contentDiagnostic.violations.map((item) => ({ category: "completeness" as const, message: `${item.code}${item.heading ? `: ${item.heading}` : item.requiredElement ? `: ${item.requiredElement}` : ""}`, severity: "error" as const })) : []),
    ];
    return Object.freeze({
      approved,
      approvalType,
      approvalState: approved ? "approved" : blocked || opportunityBlocked || contentTargetBlocked || evidenceClaimTasks.length ? "blocked" : "improvement_required",
      findings: Object.freeze(findings),
      overallScore,
      ...(opportunityReview ? { opportunityReview } : {}),
      reviews: Object.freeze(dimensions),
      dimensions: Object.freeze(dimensions),
      tasks: Object.freeze([...dimensions.flatMap((item) => item.tasks.map((message) => ({ category: item.category, message, status: item.status === "blocked" ? "blocked" as const : "action_required" as const }))), ...opportunityTasks, ...evidenceClaimTasks, ...(signals.hasExplicitQualityTarget ? signals.contentDiagnostic.violations.map((item) => ({ category: "completeness" as const, message: `${item.code}${item.heading ? `: ${item.heading}` : item.requiredElement ? `: ${item.requiredElement}` : ""}`, status: "blocked" as const })) : [])]),
      reviewedAt: context.reviewedAt ?? new Date().toISOString(),
      reviewedRevisionId: context.revisionId ?? editorialRevisionId(document),
      weights: qualityDimensionWeights,
    });
  }
}

export class PublishingGate {
  assertReady(report: QualityReport, currentRevisionId?: string, document?: ContentDocument): void {
    if (currentRevisionId && report.reviewedRevisionId !== currentRevisionId) throw new Error("Publishing blocked: Quality Review is stale for the current content revision.");
    if (!isStandardQualityApproved(report)) throw new Error(`Publishing blocked: standard quality approval is required; score ${report.overallScore}, approval ${report.approvalType ?? "none"}.`);
    if (document && requiresLongFormValidation(document)) {
      const diagnostic = analyzeLongFormDocument(document, document.metadata?.qualityTarget);
      if (diagnostic.violations.length) throw new Error(`Publishing blocked: content does not satisfy its ${document.metadata?.qualityTarget?.contentDepth ?? "planned"} quality target (${diagnostic.violations[0]?.code}).`);
    }
  }
}

export function contentRevisionId(document: ContentDocument): string {
  const metadata = editorialRevisionMetadata(document);
  const source = JSON.stringify({
    title: document.title,
    ...(metadata ? { metadata } : {}),
    blocks: document.blocks,
  });
  return revisionHash(source);
}

/**
 * Canonical manuscript revision used by Standard Quality. System-owned catalog
 * and Evidence projections do not change the user's editorial manuscript.
 */
export function editorialRevisionId(document: ContentDocument): string {
  const metadata = editorialRevisionMetadata(document);
  const source = JSON.stringify({
    title: document.title,
    ...(metadata ? { metadata } : {}),
    blocks: document.blocks.filter((block) => !isSystemProjectionBlock(block)),
  });
  return revisionHash(source);
}

function editorialRevisionMetadata(
  document: ContentDocument,
): Readonly<{ seoTitle?: string; metaDescription?: string }> | undefined {
  const seoTitle = document.metadata?.seoTitle?.trim();
  const metaDescription = document.metadata?.metaDescription?.trim();
  if (!seoTitle && !metaDescription) return undefined;
  return Object.freeze({
    ...(seoTitle ? { seoTitle } : {}),
    ...(metaDescription ? { metaDescription } : {}),
  });
}

function revisionHash(source: string): string {
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
  const imagePromptAnalysis = analyzeImagePrompts(document, context.primaryKeyword);
  const promptScoredImageIds = new Set(images
    .filter((item) => Boolean(item.source.trim()))
    .map((item) => item.id));
  const opportunityAlignment = context.opportunity ? analyzeContentOpportunityAlignment(document, context.opportunity) : undefined;
  const unsupportedEvidenceClaims = context.opportunity ? detectUnsupportedEvidenceClaims(text, context.opportunity) : [];
  const normalized = normalizeSeoKeyword(text).toLocaleLowerCase("ko-KR");
  /**
   * Every term here must name the manuscript's own production. A bare `작성할`
   * did not: it is the ordinary Korean verb a life-economy checklist heading
   * uses for what the *reader* writes, and `해지 버튼을 누르기 전에 작성할 네 가지
   * 확인 기록` — a heading doing exactly what the checklist role asks — matched
   * it. The hit costs 45 points at `informationSufficiencyScore`, which
   * usefulness derives from, so one reader-facing verb took completeness and
   * usefulness from 100 to 55 and the overall score from 100 to 87 while the
   * article carried the false reason that it contained a writing plan.
   */
  const planningPattern = /(?:(?:글|원고|포스팅|본문|초안|콘텐츠)(?:을|를|은|는)?\s*작성할|작성할\s*(?:예정|계획)|다룰 예정|추가 예정|초안 지시|기획안|아웃라인|목차를 구성|will (?:write|cover|discuss)|to be written|placeholder|todo|tbd|insert .+ here)/i;
  const placeholderPattern = /(?:lorem ipsum|내용을 입력|여기에 .+ 입력|예시 문구|placeholder|todo|tbd)/i;
  const headingNames = headings.map((item) => item.text.trim().toLowerCase()).filter(Boolean);
  const duplicateHeadingCount = headingNames.length - new Set(headingNames).size;
  const keyword = normalizeSeoKeyword(context.primaryKeyword ?? "").toLocaleLowerCase("ko-KR");
  const keywordOccurrences = keyword ? normalized.split(keyword).length - 1 : 0;
  const qualityTarget = context.qualityTarget ?? context.opportunity?.qualityTarget ?? document.metadata?.qualityTarget;
  const hasExplicitQualityTarget = Boolean(qualityTarget);
  const contentDiagnostic = analyzeLongFormDocument(document, qualityTarget);
  const paragraphSentenceCounts = paragraphs.map((item) => sentenceCount(item.text));
  const singleSentenceParagraphs = paragraphs.filter((_, index) => paragraphSentenceCounts[index] < 2).length;
  /**
   * 한 문장이 한 번에 읽히는 길이인지.
   *
   * 지금까지 가독성은 "문단에 문장이 몇 개인가"만 셌다. 그래서 한 문장이 세 절을
   * 이어 붙여 29어절이 되어도 이 엔진은 100점을 줬고, 발행한 뒤 워드프레스
   * 가독성 분석이 그제야 빨간 표시를 냈다. 2026-08-14 brightjaetech.kr 게시물
   * 98번에서 20어절 이상 문장이 33.8%로 측정됐고, 우리 점수는 감점이 없었다.
   * 검사가 우리가 보낸 것만 보고 도착한 글은 보지 않는, 이 프로젝트가 되풀이해 온
   * 모양이다.
   */
  const readerSentences = paragraphs.flatMap((item) => splitReaderSentences(item.text));
  const longSentenceCount = readerSentences.filter((item) => wordCount(item) >= longSentenceWordLimit).length;
  const longSentenceRatio = readerSentences.length ? longSentenceCount / readerSentences.length : 0;
  const openings = paragraphs.map((item) => item.text.trim().slice(0, 18)).filter((value) => value.length >= 8);
  const repeatedOpenings = openings.length - new Set(openings).size;
  const clicheCount = matches(text, /(?:알아보겠습니다|살펴보겠습니다|중요합니다|도움이 됩니다|필수적입니다)/g);
  const experienceClaim = /(?:제가|나는|저는|직접)\s*.{0,24}(?:경험했|겪었|사용했|먹어봤|해봤)/i.test(text);
  const sections = contentDiagnostic.sections.map((section) => ({ heading: section.heading, characters: section.proseCharacters }));
  const shallowSections = contentDiagnostic.violations.filter((item) => item.code === "CONTENT_INCOMPLETE_SECTION").length;
  const metaDescription = document.metadata?.metaDescription?.trim() ?? "";
  const titleLength = document.title.trim().length;
  const titleColonCount = matches(document.title, /:/g);
  const titleListSeparatorCount = matches(document.title, /[·,/]/g);
  const tistoryTags = deriveContentTags(document, context.primaryKeyword);
  const duplicateBlockIds = document.blocks.length - new Set(document.blocks.map((block) => block.id)).size;
  const emptyParagraphs = paragraphs.filter((item) => !item.text.trim()).length;
  const invalidButtonUrls = buttons.filter((item) => !isValidButtonUrl(item.targetUrl)).length;
  const targetPolicyViolations = buttons.filter((item) => violatesLinkTargetPolicy(item.targetUrl, item.target, item.purpose)).length;
  const editorialInstructionCount = matches(text, /(?:내부 링크를 연결하기 좋습니다|이 지점에서 .* 연결|편집자용|작성자 메모|초안 지시|여기에 .* 추가)/g);
  const structuralToolSignals = contentDiagnostic.sections.reduce((sum, section) => sum + section.listItemCount + section.tableCount, 0);
  const practicalToolSignals = structuralToolSignals + matches(text, /(?:체크리스트|기록표|예시|순서|단계|먼저|다음으로|마지막으로|한눈에|표로 정리|행동 흐름)/g);
  const vagueInstructionCount = matches(text, /(?:일정 기간|잠시|필요한 경우|상황에 따라|적절한 때|충분히 쉬고|며칠간)/g);
  const concreteCriteriaCount = matches(text, /(?:\d+\s*(?:분|초|시간|일|회|번)|첫째|둘째|셋째|1단계|2단계|3단계|먼저|다음(?:으로)?|마지막(?:으로)?|통증|증상|조건|상태|불편|중단|확인)/g);
  const semanticHeadingOverlapCount = countSemanticHeadingOverlap(headingNames);
  const repeatedCoreAdviceCount = contentDiagnostic.repetitionWarnings.length;
  return { document, context, text, metrics, paragraphs, headings, buttons, images, imagePromptAnalysis, promptScoredImageIds, opportunityAlignment, unsupportedEvidenceClaims, contentDiagnostic, hasExplicitQualityTarget, planning: planningPattern.test(text), placeholders: placeholderPattern.test(text), duplicateHeadingCount, emptyHeadings: headings.filter((item) => !item.text.trim()).length, keyword, keywordOccurrences, singleSentenceParagraphs, longSentenceCount, longSentenceRatio, readerSentenceCount: readerSentences.length, repeatedOpenings, clicheCount, experienceClaim, sections, shallowSections, metaDescription, titleLength, titleColonCount, titleListSeparatorCount, tistoryTags, duplicateBlockIds, emptyParagraphs, invalidButtonUrls, targetPolicyViolations, editorialInstructionCount, structuralToolSignals, practicalToolSignals, vagueInstructionCount, concreteCriteriaCount, semanticHeadingOverlapCount, repeatedCoreAdviceCount };
}

function detectUnsupportedEvidenceClaims(text: string, opportunity: ConfirmedContentOpportunity): readonly string[] {
  const result: string[] = [], noMarket = opportunity.marketEvidenceStatus === "unavailable";
  if (noMarket && /(?:월간\s*검색량\s*(?:은|이|:)?\s*[\d,.]+|CPC\s*(?:는|가|:)?\s*[₩$]?\s*[\d,.]+|시장\s*(?:에서\s*)?1위|검색량(?:이|은)\s*높)/i.test(text)) result.push("확인된 외부 시장 Evidence 없이 검색량, CPC, 시장 순위 또는 높은 수요를 주장할 수 없습니다.");
  if (opportunity.freshness === "stale" && /(?:최신|현재|최근)\s*(?:데이터|검색량|추세|성과)/i.test(text)) result.push("stale Evidence를 최신 또는 현재 데이터처럼 서술할 수 없습니다.");
  if (/광고\s*경쟁도.{0,24}SEO\s*(?:난이도|경쟁도)/i.test(text)) result.push("Google Ads 광고 경쟁도를 SEO 난이도로 변환할 수 없습니다.");
  if (/(?:CPC|RPM).{0,30}(?:예상\s*수익|수익을\s*예측)/i.test(text)) result.push("CPC 또는 RPM을 게시물 예상 수익으로 직접 환산할 수 없습니다.");
  if (/추천\s*유형.{0,20}(?:품질\s*점수|원고\s*점수)/i.test(text)) result.push("추천 유형은 원고 품질 점수가 아닙니다.");
  return Object.freeze(result);
}

function evaluate(s: Signals): QualityDimensionResult[] {
  const intro = s.paragraphs[0]?.text.trim() ?? "", conclusion = s.paragraphs.at(-1)?.text.trim() ?? "";
  const contextualInternalLinks = s.buttons.filter((item) => item.purpose === "internal_link" && isPublicContentUrl(item.targetUrl, s.context.platform));
  const relatedPosts = s.buttons.filter((item) => item.purpose === "related_post" && isPublicContentUrl(item.targetUrl, s.context.platform));
  const ctaButtons = s.buttons.filter((item) => (item.purpose === "cta" || (!item.purpose && !item.targetUrl.startsWith("/"))) && Boolean(item.targetUrl.trim()));
  const externalClaims = /(?:\d+(?:\.\d+)?%|연구에 따르면|통계에 따르면|according to (?:research|a study))/i.test(s.text);
  const hasCitation = /https?:\/\/|출처|참고문헌|source:/i.test(s.text);
  const requiredMissing = s.contentDiagnostic.requiredContentElements.filter((item) => item.status === "missing").length;
  const requiredMentioned = s.contentDiagnostic.requiredContentElements.filter((item) => item.status === "mentioned").length;
  const requiredSufficient = s.contentDiagnostic.requiredContentElements.filter((item) => item.status === "sufficient").length;
  const incompleteSections = s.contentDiagnostic.sections.filter((item) => item.completeness !== "sufficient").length;
  const informationSufficiencyScore = clamp(
    100
    - requiredMissing * 30
    - requiredMentioned * 15
    - incompleteSections * 12
    - (s.planning ? 45 : 0)
    - (s.vagueInstructionCount > s.concreteCriteriaCount ? 12 : 0),
  );
  const keywordDensity = s.keyword && s.metrics.wordUnits ? s.keywordOccurrences / s.metrics.wordUnits : 0;
  const invalidHeadingOrder = s.headings.some((heading, index) => index > 0 && heading.level > s.headings[index - 1].level + 1);
  const intentMetadata = Boolean(s.document.metadata?.primarySearchIntent?.trim());
  const intentSignal = s.opportunityAlignment?.review.searchIntentFulfillment;
  const searchIntentFulfilled = intentSignal?.pass ?? Boolean(s.context.searchIntent && intro.length > 0 && requiredMissing === 0);
  const measuredSearchIntentScore = !s.context.searchIntent
    ? 0
    : intentSignal
      ? intentSignal.score
      : intentMetadata && intro.length > 0 && conclusion.length > 0 && requiredMissing === 0
        ? 95
        : intro.length > 0 ? 80 : 60;
  const searchIntentScore = measuredSearchIntentScore;
  const singleSentenceThreshold = Math.max(2, Math.floor(s.paragraphs.length * 0.4));
  const singleSentenceExcess = Math.max(0, s.singleSentenceParagraphs - singleSentenceThreshold);
  const longSentencePenalty = Math.min(20, Math.round(Math.max(0, s.longSentenceRatio - longSentenceRatioLimit) * 200));
  const placedImages = s.images.filter((item) =>
    Boolean(item.source.trim()) || isBrightComponentPurpose(item.purpose));
  const imageStrategyComplete = placedImages.length > 0
    && placedImages.every((item) => item.alt.trim().length >= 4);
  const actionableImageIssues = s.imagePromptAnalysis.issues.filter((item) => item.code !== "missing_prompt"
    && item.blockIds.every((blockId) => s.promptScoredImageIds.has(blockId)));
  const imagePromptPenalty = actionableImageIssues.reduce((sum, item) => sum + imageIssuePenalty(item), 0);
  const imageStrategyBaseScore = !s.document.blocks.length ? 0 : !placedImages.length ? 100 : imageStrategyComplete ? 94 : 58;
  const repeatedImageRolePenalty = s.images.length >= 4 && new Set(s.images.map((item) => item.purpose ?? "inline")).size <= 2 ? 15 : 0;
  const zeroCostVisualSignals = s.images.filter((item) => isBrightComponentPurpose(item.purpose)).length
    + s.contentDiagnostic.sections.reduce((sum, section) => sum + section.tableCount, 0);
  const distinctImageRoles = s.images.length >= 2
    && new Set(s.images.map((item) => `${item.purpose ?? "inline"}:${item.alt.trim().slice(0, 24)}`)).size === s.images.length;
  const imagePurposeBonus = imageStrategyComplete && (zeroCostVisualSignals > 0 || distinctImageRoles) ? 6 : 0;
  const imageStrategyScore = clamp(imageStrategyBaseScore + imagePurposeBonus - imagePromptPenalty - repeatedImageRolePenalty);
  const candidateCount = s.context.availableInternalLinkCandidates;
  const placedInternalLinkCount = contextualInternalLinks.length + relatedPosts.length;
  const linkPlacementMissing = typeof candidateCount === "number" && candidateCount > 0 && placedInternalLinkCount === 0;
  const internalLinkReasons = [
    ...(s.context.internalLinkCatalogStatus === "catalog_unavailable" ? ["현재 발행 플랫폼의 공개 글 카탈로그를 불러오지 못해 내부 링크 자동 배치를 완료하지 못했습니다."] : []),
    ...(s.context.internalLinkCatalogStatus === "category_missing" ? ["현재 콘텐츠의 발행 카테고리가 확인되지 않아 내부 링크 자동 배치를 생략했습니다."] : []),
    ...(linkPlacementMissing ? [`같은 카테고리에 사용할 수 있는 공개 글 ${candidateCount}개가 있지만 내부 링크가 배치되지 않았습니다.`] : []),
    ...(contextualInternalLinks.length === 0 && relatedPosts.length > 0 ? ["관련 글은 배치됐지만 본문 문맥에 연결된 내부 링크는 없습니다."] : []),
    ...(typeof candidateCount !== "number" && placedInternalLinkCount === 0 && !s.context.internalLinkCatalogStatus ? ["내부 링크 후보 가용성 정보가 없습니다."] : []),
  ];
  const titleTooLong = s.titleLength > 68;
  const titleHasRepeatedColon = s.titleColonCount > 1;
  const titleLooksLikeKeywordList = s.titleListSeparatorCount > 2;
  const titlePenalty = (titleTooLong ? 20 : 0) + (titleHasRepeatedColon ? 10 : 0) + (titleLooksLikeKeywordList ? 10 : 0);
  const keywordRepeated = keywordDensity > 0.08 || s.keywordOccurrences > 15;
  const titleContainsKeyword = Boolean(s.keyword && titleContainsPrimaryKeyword(s.document.title, s.keyword));
  const metaDescriptionValid = s.metaDescription.length >= 60 && s.metaDescription.length <= 180;
  const tagPenalty = s.context.platform === "tistory" && s.tistoryTags.length < 5 ? 15 : 0;
  const seoBase = s.keyword
    ? 55 + (titleContainsKeyword ? 20 : 0) + (s.keywordOccurrences > 0 ? 15 : 0) + (metaDescriptionValid ? 10 : 0) - (keywordRepeated ? 35 : 0) - tagPenalty
    : 35 + (s.metaDescription ? 10 : 0) - tagPenalty;

  return [
    dimension("searchIntent", searchIntentScore,
      !s.context.searchIntent
        ? ["확정된 검색 의도 정보가 없어 평가할 수 없습니다."]
        : !searchIntentFulfilled
          ? ["원고가 확정된 검색 의도의 독자 질문과 행동 목표에 충분히 답하지 않습니다."]
          : searchIntentScore >= 85 ? [] : ["도입부와 주요 섹션이 확정된 검색 의도를 충분히 해결하지 못합니다."],
      s.context.searchIntent
        ? ["확정 검색 의도의 핵심 질문과 실행 목표가 도입부·주요 섹션·결론에 드러나도록 원고를 보완하세요."]
        : ["콘텐츠 기획의 검색 의도를 저장한 뒤 다시 검토하세요."],
      [{ signal: "confirmedSearchIntent", value: s.context.searchIntent ?? false }, { signal: "intentFulfillmentScore", value: intentSignal?.score ?? measuredSearchIntentScore }, { signal: "intentMetadata", value: intentMetadata }, { signal: "searchIntentFulfilled", value: intentSignal?.pass ?? "not_evaluated" }, { signal: "contentOpportunityConsistent", value: s.opportunityAlignment?.review.contentOpportunityConsistency.pass ?? "not_evaluated" }],
      s.context.searchIntent ? !searchIntentFulfilled ? "blocked" : "evaluated" : "not_evaluated"),
    dimension("seo", clamp(seoBase - titlePenalty),
      [
        ...(keywordRepeated ? ["핵심 키워드가 지나치게 반복됩니다."] : []),
        ...(s.keyword && !titleContainsKeyword ? ["제목이 핵심 키워드를 명확히 반영하지 않습니다."] : []),
        ...(titleTooLong ? ["제목이 68자를 초과해 핵심 내용을 빠르게 파악하기 어렵습니다."] : []),
        ...(titleHasRepeatedColon ? ["제목에 콜론이 두 번 이상 사용되어 문장 구조가 복잡합니다."] : []),
        ...(titleLooksLikeKeywordList ? ["제목에 키워드가 나열되어 자연스러운 문장 가독성이 떨어집니다."] : []),
        ...(!s.metaDescription ? ["실제 본문을 요약한 메타디스크립션이 없습니다."] : []),
        ...(s.metaDescription && !metaDescriptionValid ? ["메타디스크립션이 핵심 내용을 충분히 설명하지 못하거나 지나치게 깁니다."] : []),
        ...(s.context.platform === "tistory" && s.tistoryTags.length < 5 ? ["티스토리 하단에 입력할 주제 적합 태그가 5개 미만입니다."] : []),
      ],
      ["제목을 68자 이내, 콜론 1개 이하의 자연스러운 문장으로 줄이고 제목·메타디스크립션·본문에 핵심 키워드를 자연스럽게 배치하세요."],
      [{ signal: "keywordOccurrences", value: s.keywordOccurrences }, { signal: "keywordDensity", value: Number(keywordDensity.toFixed(3)) }, { signal: "metaDescriptionLength", value: s.metaDescription.length }, { signal: "titleLength", value: s.titleLength }, { signal: "titleColonCount", value: s.titleColonCount }, { signal: "titleListSeparatorCount", value: s.titleListSeparatorCount }, { signal: "tistoryTagCount", value: s.tistoryTags.length }, { signal: "tistoryTags", value: s.tistoryTags.join(", ") || false }]),
    dimension("readability", clamp(100 - Math.min(18, singleSentenceExcess * 3) - Math.min(15, s.repeatedOpenings * 5) - Math.min(20, s.clicheCount * 4) - longSentencePenalty),
      [...(singleSentenceExcess ? ["한 문장 문단이 반복되어 흐름이 끊깁니다."] : []), ...(longSentencePenalty ? [`${longSentenceWordLimit}어절 이상 긴 문장이 전체의 ${Math.round(longSentenceRatioLimit * 100)}%를 넘어 한 번에 읽히지 않습니다.`] : []), ...(s.clicheCount ? ["상투적인 AI 표현이 반복됩니다."] : [])], ["문단마다 하나의 논점을 명확히 설명하고, 절을 이어 붙인 긴 문장은 두 문장으로 나누세요."], [{ signal: "paragraphCount", value: s.metrics.paragraphCount }, { signal: "singleSentenceParagraphs", value: s.singleSentenceParagraphs }, { signal: "singleSentenceThreshold", value: singleSentenceThreshold }, { signal: "singleSentenceExcess", value: singleSentenceExcess }, { signal: "repeatedOpenings", value: s.repeatedOpenings }, { signal: "clicheCount", value: s.clicheCount }, { signal: "readerSentenceCount", value: s.readerSentenceCount }, { signal: "longSentenceCount", value: s.longSentenceCount }, { signal: "longSentenceRatio", value: Number(s.longSentenceRatio.toFixed(3)) }]),
    dimension("structure", clamp(100 - (!intro ? 25 : 0) - (!conclusion ? 20 : 0) - (!s.headings.length ? 25 : 0) - s.duplicateHeadingCount * 15 - s.emptyHeadings * 20 - (invalidHeadingOrder ? 20 : 0) - Math.min(30, s.shallowSections * 10) - Math.min(20, s.semanticHeadingOverlapCount * 8) - Math.min(12, s.repeatedCoreAdviceCount * 3) - Math.min(20, s.editorialInstructionCount * 20)),
      [...(!intro ? ["게시글 도입부가 없습니다."] : []), ...(!conclusion ? ["핵심을 정리하고 다음 행동을 안내하는 결론이 없습니다."] : []), ...(!s.headings.length ? ["독자의 질문을 구분하는 구조화된 섹션이 없습니다."] : []), ...(s.duplicateHeadingCount || s.emptyHeadings ? ["비어 있거나 중복된 제목이 있습니다."] : []), ...(s.shallowSections ? ["역할을 완결하지 못한 주요 섹션이 있습니다."] : []), ...(s.semanticHeadingOverlapCount ? ["역할과 의미가 겹치는 소제목이 있어 구조가 반복됩니다."] : []), ...(s.repeatedCoreAdviceCount ? ["같은 핵심 조언이 여러 섹션에서 반복됩니다."] : []), ...(s.editorialInstructionCount ? ["독자용 본문에 편집자용 내부 링크·작성 지시 문장이 남아 있습니다."] : [])], ["각 H2가 서로 다른 독자 질문과 행동 목표를 담당하도록 구성하고, 빈 섹션과 중복 섹션을 정리하세요."], [{ signal: "headingCount", value: s.metrics.headingCount }, { signal: "sufficientSections", value: s.contentDiagnostic.sections.filter((item) => item.completeness === "sufficient").length }, { signal: "incompleteSections", value: incompleteSections }, { signal: "semanticHeadingOverlapCount", value: s.semanticHeadingOverlapCount }, { signal: "repeatedCoreAdviceCount", value: s.repeatedCoreAdviceCount }, { signal: "editorialInstructionCount", value: s.editorialInstructionCount }]),
    dimension("completeness", informationSufficiencyScore,
      [...(s.planning ? ["완성된 글이 아니라 작성 계획이나 지시문이 본문에 포함되어 있습니다."] : []), ...(requiredMissing ? ["필수 정보 요소가 누락되었습니다."] : []), ...(requiredMentioned ? ["필수 정보 요소가 형식적으로만 언급되어 독자가 이해하거나 적용하기 어렵습니다."] : []), ...(incompleteSections ? ["역할에 필요한 설명·판단 기준·예시가 부족한 섹션이 있습니다."] : []), ...(s.vagueInstructionCount > s.concreteCriteriaCount ? ["‘잠시’, ‘일정 기간’, ‘필요한 경우’ 같은 표현에 비해 적용 가능한 조건·순서·예시가 부족합니다."] : [])], ["누락되거나 언급에 그친 필수 정보를 독자가 이해하고 적용할 수 있도록 판단 기준, 예시, 주의사항, 다음 행동으로 보완하세요."], [{ signal: "requiredElementsMissing", value: requiredMissing }, { signal: "requiredElementsMentioned", value: requiredMentioned }, { signal: "requiredElementsSufficient", value: requiredSufficient }, { signal: "incompleteSections", value: incompleteSections }, { signal: "planningLanguageDetected", value: s.planning }, { signal: "vagueInstructionCount", value: s.vagueInstructionCount }, { signal: "concreteCriteriaCount", value: s.concreteCriteriaCount }]),
    dimension("usefulness", clamp(informationSufficiencyScore - (s.placeholders ? 40 : 0) - (externalClaims && !hasCitation ? 10 : 0) - (s.experienceClaim ? 20 : 0) - (s.practicalToolSignals < 1 ? 15 : 0) - Math.min(15, s.repeatedCoreAdviceCount * 3)),
      [...(s.placeholders ? ["placeholder 또는 작성 지시 문구가 남아 있습니다."] : []), ...(externalClaims && !hasCitation ? ["수치나 연구 주장을 뒷받침하는 출처를 확인할 수 없습니다."] : []), ...(s.experienceClaim ? ["사용자가 제공하지 않은 개인 경험처럼 보이는 표현이 있습니다."] : []), ...(s.practicalToolSignals < 1 ? ["체크리스트·기록 예시·단계별 행동 흐름처럼 바로 사용할 수 있는 실용 도구가 부족합니다."] : []), ...(s.repeatedCoreAdviceCount ? ["같은 조언이 반복되어 새로운 정보 밀도가 낮아집니다."] : [])], ["독자가 바로 사용할 수 있는 체크리스트, 기록 예시, 단계별 판단 순서와 다음 행동을 추가하세요."], [{ signal: "placeholderDetected", value: s.placeholders }, { signal: "unsupportedClaimSignal", value: externalClaims && !hasCitation }, { signal: "fabricatedExperienceRisk", value: s.experienceClaim }, { signal: "structuralToolSignals", value: s.structuralToolSignals }, { signal: "practicalToolSignals", value: s.practicalToolSignals }, { signal: "repeatedCoreAdviceCount", value: s.repeatedCoreAdviceCount }], externalClaims && !hasCitation || s.experienceClaim ? "blocked" : "evaluated"),
    dimension("htmlQuality", clamp(100 - s.emptyHeadings * 30 - s.emptyParagraphs * 20 - s.duplicateHeadingCount * 15 - s.duplicateBlockIds * 30 - s.invalidButtonUrls * 25 - s.targetPolicyViolations * 15 - (invalidHeadingOrder ? 25 : 0) - (s.document.blocks.length ? 0 : 100)),
      [...(!s.document.blocks.length ? ["렌더링할 canonical block이 없습니다."] : []), ...(invalidHeadingOrder ? ["제목 단계가 건너뛰어 HTML 문서 구조가 올바르지 않습니다."] : []), ...(s.emptyParagraphs ? ["빈 문단 블록이 남아 있습니다."] : []), ...(s.duplicateBlockIds ? ["중복된 block id가 있어 목차·앵커 렌더링 충돌 위험이 있습니다."] : []), ...(s.invalidButtonUrls ? ["유효하지 않은 버튼 또는 링크 URL이 있습니다."] : []), ...(s.targetPolicyViolations ? ["내부·외부 링크의 target 정책이 올바르지 않습니다."] : [])], ["빈 블록, 중복 ID, 잘못된 URL과 링크 target 정책을 수정하고 제목 단계를 순서대로 정리하세요."], [{ signal: "blockCount", value: s.document.blocks.length }, { signal: "headingHierarchyValid", value: !invalidHeadingOrder }, { signal: "emptyParagraphs", value: s.emptyParagraphs }, { signal: "duplicateBlockIds", value: s.duplicateBlockIds }, { signal: "invalidButtonUrls", value: s.invalidButtonUrls }, { signal: "targetPolicyViolations", value: s.targetPolicyViolations }]),
    dimension("imageStrategy", imageStrategyScore,
      [
        ...(!placedImages.length
          ? ["실제 공개 HTML에 렌더되는 이미지가 없어 source-empty 편집 추천을 품질 점수에서 제외했습니다."]
          : imageStrategyComplete ? [] : ["실제 렌더되는 이미지 블록의 설명 텍스트가 부족합니다."]),
        ...actionableImageIssues.map((item) => item.message),
      ],
      actionableImageIssues.length ? actionableImageIssues.map(imageIssueTask) : ["본문 흐름에 맞는 이미지 placeholder와 구체적인 ALT 설명을 배치하세요."],
      [
        { signal: "recommendedImageBlocks", value: s.images.length },
        { signal: "renderedImageBlocks", value: placedImages.length },
        { signal: "descriptiveImageBlocks", value: s.images.filter((item) => item.alt.trim().length >= 4).length },
        { signal: "uploadedImageBlocks", value: s.images.filter((item) => Boolean(item.source.trim())).length },
        { signal: "promptScoredImageBlocks", value: s.promptScoredImageIds.size },
        { signal: "duplicateImagePrompts", value: actionableImageIssues.filter((item) => item.code === "duplicate_prompt").length },
        { signal: "highSimilarityImagePrompts", value: actionableImageIssues.filter((item) => item.code === "high_similarity").length },
        { signal: "purposeMismatchedImagePrompts", value: actionableImageIssues.filter((item) => item.code === "purpose_mismatch").length },
        { signal: "sectionContextMissingImagePrompts", value: actionableImageIssues.filter((item) => item.code === "section_context_missing").length },
        { signal: "uniformImagePurpose", value: actionableImageIssues.some((item) => item.code === "uniform_purpose") },
        { signal: "repeatedImageRolePenalty", value: repeatedImageRolePenalty },
        { signal: "zeroCostVisualSignals", value: zeroCostVisualSignals },
      ], placedImages.length ? "evaluated" : "optional"),
    dimension("internalLinks", 100,
      internalLinkReasons.length ? internalLinkReasons : ["내부 링크와 관련 글은 생성·배치 진단 항목이며 품질 점수에는 반영하지 않습니다."],
      [], [{ signal: "scoringExcluded", value: true }, { signal: "placedContextualInternalLinks", value: contextualInternalLinks.length }, { signal: "placedRelatedPosts", value: relatedPosts.length }, { signal: "availableSameCategoryCandidates", value: candidateCount ?? "unknown" }, { signal: "categoryName", value: s.context.categoryName ?? false }, { signal: "catalogStatus", value: s.context.internalLinkCatalogStatus ?? "unknown" }], "optional"),
    dimension("cta", 100,
      ctaButtons.length ? [...ctaReasons(ctaButtons, s.text), "CTA는 생성·배치 진단 항목이며 품질 점수에는 반영하지 않습니다."].filter(Boolean) : ["CTA는 원고 생성 요구사항이지만 존재 여부와 개수는 품질 점수에 반영하지 않습니다."],
      [], [{ signal: "scoringExcluded", value: true }, { signal: "placedCtaBlocks", value: ctaButtons.length }], "optional"),
  ];
}
function isPublicContentUrl(value: string, platform?: string): boolean { try { const url = new URL(value); if (url.protocol !== "https:" || /\/manage(?:\/|$)/i.test(url.pathname)) return false; return platform === "tistory" ? /\.tistory\.com$/i.test(url.hostname) && url.pathname.startsWith("/entry/") : true; } catch { return false; } }

function imageIssuePenalty(issue: ImagePromptIssue): number {
  return ({ duplicate_prompt: 30, high_similarity: 18, purpose_mismatch: 18, section_context_missing: 18, uniform_purpose: 16, missing_prompt: 0 })[issue.code];
}

function imageIssueTask(issue: ImagePromptIssue): string {
  if (issue.code === "duplicate_prompt" || issue.code === "high_similarity") return `${issue.message} 각 이미지가 속한 H2를 기준으로 핵심 대상·행동·배경·구도·시점·정보 표현 중 두 가지 이상을 실제로 다르게 수정하세요.`;
  if (issue.code === "purpose_mismatch") return `${issue.message} purpose에 맞는 전달 목적과 구도를 프롬프트에 명시하세요.`;
  if (issue.code === "section_context_missing") return `${issue.message} 해당 H2의 핵심 행동이나 판단 기준을 장면 지시에 포함하세요.`;
  if (issue.code === "uniform_purpose") return `${issue.message} 글 전체를 대표하는 장면과 섹션 설명·비교·요약 역할을 필요한 위치에 분배하세요.`;
  return issue.message;
}

function opportunitySignals(review: ContentOpportunityQualityReview) {
  return [
    { label: "주제 충실도", signal: review.topicFidelity },
    { label: "대표 키워드 정렬", signal: review.primaryKeywordAlignment },
    { label: "검색 의도 충족", signal: review.searchIntentFulfillment },
    { label: "보조 키워드 지원", signal: review.secondaryKeywordSupport },
    { label: "제목·주제 정렬", signal: review.titleTopicAlignment },
    { label: "목차 범위", signal: review.headingCoverage },
    { label: "본문 범위", signal: review.bodyCoverage },
    { label: "기획 원자성", signal: review.contentOpportunityConsistency },
    { label: "주제 이탈", signal: review.crossTopicDrift },
    { label: "미지원 키워드", signal: review.unsupportedKeywordUsage },
  ] as const;
}

function dimension(category: QualityCategory, score: number, reasons: string[], tasks: string[], evidence: QualityEvidence[], evaluation: "evaluated" | "blocked" | "optional" | "not_evaluated" = "evaluated"): QualityDimensionResult {
  const normalized = clamp(Math.round(score));
  const status: QualityDimensionStatus = evaluation === "blocked" || evaluation === "not_evaluated" ? "blocked" : normalized >= 85 ? "ready" : "needs_improvement";
  const normalizedReasons = reasons.length ? reasons : [normalized === 100 ? "모든 정의된 검사 기준을 통과했습니다." : normalized >= 85 ? "핵심 기준은 충족했지만 최고점 기준까지는 추가 개선 여지가 있습니다." : "현재 측정값이 게시 준비 기준에 미치지 못합니다."];
  return Object.freeze({
    category,
    score: evaluation === "not_evaluated" ? 0 : normalized,
    status,
    evaluation: evaluation === "optional" || evaluation === "not_evaluated" ? "not_evaluated" : "evaluated",
    reasons: Object.freeze(normalizedReasons),
    tasks: Object.freeze(normalized < 100 ? tasks : []),
    evidence: Object.freeze(evidence),
  });
}

function isValidButtonUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try { const url = new URL(trimmed); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}
/**
 * `internal_link` and `related_post` blocks are placed by internal navigation and
 * always point at the publisher's own site, so they are internal whatever shape
 * their URL takes. Deciding by URL alone only recognised relative paths and
 * Tistory entries, which wrongly flagged every absolute self-site link on
 * platforms such as WordPress.
 */
function violatesLinkTargetPolicy(
  value: string,
  target?: "_self" | "_blank",
  purpose?: string,
): boolean {
  const trimmed = value.trim();
  const internal = purpose === "internal_link"
    || purpose === "related_post"
    || trimmed.startsWith("/")
    || /\.tistory\.com\/entry\//i.test(trimmed);
  return internal ? target === "_blank" : Boolean(trimmed) && target === "_self";
}
function countSemanticHeadingOverlap(headings: readonly string[]): number {
  const tokens = headings.map((heading) => new Set(heading.split(/[^\p{L}\p{N}]+/u).map((item) => item.trim()).filter((item) => item.length >= 2)));
  let overlaps = 0;
  for (let i = 0; i < tokens.length; i += 1) for (let j = i + 1; j < tokens.length; j += 1) {
    const union = new Set([...tokens[i], ...tokens[j]]);
    if (!union.size) continue;
    const intersection = [...tokens[i]].filter((item) => tokens[j].has(item)).length;
    if (intersection / union.size >= 0.5) overlaps += 1;
  }
  return overlaps;
}
function ctaReasons(buttons: readonly { label: string; targetUrl: string }[], text: string): string[] {
  const reasons: string[] = [];
  if (buttons.some((item) => /^(?:자세히 보기|확인하기|바로가기|더 알아보기|클릭)$/u.test(item.label.trim()))) reasons.push("CTA 문구가 일반적이어서 다음 행동과 기대 결과가 구체적이지 않습니다.");
  if (buttons.some((item) => !item.label.split(/\s+/u).some((term) => term.length >= 2 && text.includes(term)))) reasons.push("일부 CTA가 인접 본문 맥락과 직접 연결되지 않습니다.");
  if (buttons.some((item) => !isValidButtonUrl(item.targetUrl))) reasons.push("유효하지 않은 CTA 목적지가 있습니다.");
  return reasons;
}
function clamp(value: number) { return Math.max(0, Math.min(100, value)); }
function sentenceCount(value: string) {
  return value
    .split(/(?:[.!?。！？]+|습니다|합니다|됩니다|있습니다|없습니다|입니다|세요|해요|돼요|나요|죠)\s*/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}
function splitReaderSentences(value: string): string[] {
  return value.split(/(?<=[.!?。！？])\s+/u).map((item) => item.trim()).filter(Boolean);
}
function wordCount(value: string) { return value.split(/\s+/u).filter(Boolean).length; }
function matches(value: string, pattern: RegExp) { return [...value.matchAll(pattern)].length; }
