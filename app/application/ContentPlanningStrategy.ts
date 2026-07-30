import type { AIProvider } from "../../core/ai";
import {
  approvalPolicyPromptContext,
  resolveApprovalPolicySnapshot,
  type ApprovalPolicyProfileId,
  type ContentPurpose,
} from "../../core/approval";
import {
  createContentOpportunityCandidate,
  determineContentPlanQualityTarget,
  type ContentOpportunityCandidate,
  type ContentOpportunitySelectionMode,
  type OpportunityEvidenceSource,
} from "../../core/content";
import type { ContentPlanningResult, ProjectContentStrategy, WorkspacePlatform } from "../user-flow/user-data";
import type { OpportunityEvidenceRecord } from "../../core/intelligence";

const DISCLOSURE = "Keyword competition and opportunity are AI estimates, not measured search-volume, CPC, or competition data.";
const SEARCH_TASK_SUFFIXES = new Set(["방법", "가이드", "비교", "기준", "조건", "순서", "계산", "신청", "설정", "추천", "정리"]);

type ApprovalAwareStrategy = ProjectContentStrategy & Readonly<{
  defaultContentPurpose?: ContentPurpose;
  approvalProfileId?: ApprovalPolicyProfileId;
}>;

export function projectStrategyAIContext(strategy: ProjectContentStrategy) {
  const approvalAware = strategy as ApprovalAwareStrategy;
  const approvalSnapshot = resolveApprovalPolicySnapshot(
    approvalAware.defaultContentPurpose,
    approvalAware.approvalProfileId,
  );
  return Object.freeze({
    primaryTopic: strategy.primaryTopic,
    subtopics: Object.freeze([...strategy.subtopics]),
    excludedTopics: Object.freeze([...strategy.excludedTopics]),
    defaultContentType: strategy.defaultContentType,
    defaultPlatform: strategy.defaultPlatform,
    targetAudience: strategy.targetAudience,
    tone: strategy.tone,
    internalLinkPolicy: strategy.internalLinkPolicy,
    relatedPostPolicy: strategy.relatedPostPolicy,
    ctaPolicy: strategy.ctaPolicy,
    imageStrategy: strategy.imageStrategy,
    seoPolicy: strategy.seoPolicy,
    ...(approvalSnapshot ? {
      approvalPolicy: approvalPolicyPromptContext(approvalSnapshot),
    } : {}),
    ...(strategy.defaultTistoryCategory ? {
      category: Object.freeze({
        id: strategy.defaultTistoryCategory.id,
        name: strategy.defaultTistoryCategory.name,
      }),
    } : {}),
  });
}

export type ContentPlanningContext = Readonly<{
  projectId: string;
  selectionMode: ContentOpportunitySelectionMode;
  projectContext?: string;
  ownedBrandTerms?: readonly string[];
  existingContent?: readonly string[];
  hasVerifiedKeywordData?: boolean;
  evidenceBundle?: readonly OpportunityEvidenceRecord[];
}>;

export class ContentPlanningStrategy {
  constructor(private readonly provider: AIProvider) {}

  async analyze(
    naturalLanguageRequest: string,
    enabledPlatforms?: readonly WorkspacePlatform[],
    context: ContentPlanningContext = { projectId: "planning-project", selectionMode: "userSpecified" },
  ): Promise<ContentPlanningResult> {
    const request = naturalLanguageRequest.trim();
    if (!request) throw new Error("What would you like to create?");
    const ownedBrandTerms = planningOwnedBrandTerms(context);
    const modeInstruction = context.selectionMode === "automatic"
      ? "The user delegated topic selection. Compare content gaps, then return 2-4 complete and mutually coherent opportunities. Select topic and primary keyword together."
      : "The user explicitly specified a topic. Keep every opportunity within that topic and search intent; never replace it with an adjacent topic because it seems more attractive.";
    const response = await this.provider.generate({
      instruction: `Analyze this content request as an editorial strategist. Do not write the final content. ${modeInstruction}
Request: ${request}
Project strategy: ${context.projectContext ?? "Use only the request and supplied project context."}
Project-owned labels that are identity, not default search keywords: ${JSON.stringify(ownedBrandTerms)}. Do not prefix selectedTopic or primaryKeyword with these labels unless the user's request explicitly makes that label the search subject. Keep third-party product, institution, and service names when they are genuinely part of the search task.
Existing content to avoid duplicating: ${(context.existingContent ?? []).join(" | ") || "none supplied"}
Server-verified Evidence bundle (read-only; never invent, alter, or add IDs/providers/metrics): ${JSON.stringify((context.evidenceBundle ?? []).map((value) => ({ evidenceId: value.evidenceId, provider: value.provider, evidenceType: value.evidenceType, metric: value.metric, keyword: value.keyword, topic: value.topic, pageUrl: value.pageUrl, periodStart: value.periodStart, periodEnd: value.periodEnd, freshness: value.freshness, verified: value.verified, value: value.value, unit: value.unit, relativeValue: value.relativeValue, changeRate: value.changeRate, limitations: value.limitations })))}
Enabled publishing platforms: ${enabledPlatforms ? (enabledPlatforms.join(", ") || "none") : "not restricted"}. ${enabledPlatforms ? "Recommend platforms only from this list." : ""}
Only the supplied server Evidence is factual. Do not invent monthly volume, CPC, competition scores, rankings, provider names, or popularity. NAVER/Trends ratios are relative, Search Console impressions are site impressions, GA4 is engagement, and AdSense scope must not be narrowed. Opportunity Evidence will be attached and classified by the server after your response; do not create Evidence IDs.
  Return JSON only with top-level interpretedIntent, domain, targetAudience, contentGoal, recommendedPlatforms, suggestedTitleAngles, contentCluster, recommendationReason, confidence, estimateDisclosure, and opportunityCandidates. Each opportunity candidate must be one atomic plan containing selectedTopic, primaryKeyword, secondaryKeywords, searchIntent, audience, contentType, contentAngle, readerProblem, expectedCoverage, coreQuestions, requiredContentElements, decisionCriteria, examplesNeeded, warningsOrExceptions, actionableNextSteps, comparisonNeeds, tableNeeds, checklistNeeds, scopeBoundaries, topicComplexity, contentDepth, selectionRationale, opportunityEvidence [{source,summary}], confidence, and cautions. contentDepth must be standard, deep, or comparison; never return quick. Do not return any prose-length or section-length targets.
  Build each candidate as a coherent information contract before returning it. The primaryKeyword must be the concise phrase a reader would actually search, including a task modifier such as 방법, 비교, 기준, 조건, 계산, 신청, or 설정 when that modifier is essential to the search intent. The selectedTopic should naturally contain the primaryKeyword phrase when that reads well; otherwise it must preserve all of the keyword's core concepts without switching to an adjacent search task. searchIntent must state the concrete question or task the reader wants resolved, not only a classification label such as informational, transactional, commercial, or navigational. readerProblem must describe the reader's decision or action obstacle. Make coreQuestions directly answerable, make requiredContentElements concrete enough to judge as missing/mentioned/sufficient, and keep expectedCoverage items mutually distinct. decisionCriteria, examplesNeeded, warningsOrExceptions, and actionableNextSteps must each add a non-duplicative editorial role. Required elements identify information the reader needs, not merely words that should appear. Topic, keyword, intent, coverage, and supporting keywords in each candidate must describe one search task.`,
      metadata: { task: "content-planning" },
    });
    const plan = parsePlanningResult(response.content, { ...context, ownedBrandTerms, sourceRequest: request });
    return enabledPlatforms ? filterPlanningPlatforms(plan, enabledPlatforms) : plan;
  }
}

export function filterPlanningPlatforms(plan: ContentPlanningResult, enabledPlatforms: readonly WorkspacePlatform[]): ContentPlanningResult {
  const allowed = new Set(enabledPlatforms);
  const recommendedPlatforms = plan.recommendedPlatforms.map(normalizePlatform).filter((platform): platform is WorkspacePlatform => platform !== undefined).filter((platform) => allowed.has(platform));
  return Object.freeze({ ...plan, recommendedPlatforms: Object.freeze([...new Set(recommendedPlatforms)]) });
}

export function createManualPlanningResult(
  request: string,
  context: Pick<ContentPlanningContext, "projectId" | "selectionMode"> = { projectId: "planning-project", selectionMode: "userSpecified" },
): ContentPlanningResult {
  const value = request.trim();
  if (!value) throw new Error("What would you like to create?");
  const candidate = createContentOpportunityCandidate({
    sourceRequest: value,
    selectionMode: context.selectionMode,
    selectedTopic: value,
    primaryKeyword: value,
    secondaryKeywords: [],
    searchIntent: "사용자가 지정한 주제를 설명하는 원고 작성",
    audience: "작성자가 확인할 대상 독자",
    contentType: "article",
    contentAngle: "사용자 지정 주제 범위 안에서 유용한 초안 작성",
    readerProblem: value,
    expectedCoverage: [],
    selectionRationale: "AI 추정 없이 사용자가 지정한 주제를 그대로 유지합니다.",
    opportunityEvidence: [{ source: "unknown", summary: "외부 검색 데이터와 AI 기획을 사용하지 않은 수동 후보입니다." }],
    confidence: 0,
    cautions: [DISCLOSURE],
    projectId: context.projectId,
  });
  return fromCandidates({
    interpretedIntent: value,
    domain: "Not classified",
    targetAudience: candidate.audience,
    contentGoal: candidate.contentAngle,
    recommendedPlatforms: [],
    suggestedTitleAngles: [value],
    contentCluster: [],
    recommendationReason: candidate.selectionRationale,
    confidence: 0,
    estimateDisclosure: DISCLOSURE,
  }, [candidate], context.selectionMode);
}

export function parsePlanningResult(
  raw: string,
  context: (Pick<ContentPlanningContext, "projectId" | "selectionMode" | "hasVerifiedKeywordData" | "ownedBrandTerms" | "projectContext"> & { sourceRequest?: string }) = { projectId: "planning-project", selectionMode: "userSpecified" },
): ContentPlanningResult {
  const value = JSON.parse(stripFence(raw)) as Record<string, unknown>;
  const base = {
    interpretedIntent: text(value.interpretedIntent, "interpretedIntent"),
    domain: text(value.domain, "domain"),
    targetAudience: text(value.targetAudience, "targetAudience"),
    contentGoal: text(value.contentGoal, "contentGoal"),
    recommendedPlatforms: list(value.recommendedPlatforms),
    suggestedTitleAngles: list(value.suggestedTitleAngles),
    contentCluster: list(value.contentCluster),
    recommendationReason: honestClaim(text(value.recommendationReason, "recommendationReason"), context.hasVerifiedKeywordData === true),
    confidence: confidence(value.confidence),
    estimateDisclosure: disclosure(value.estimateDisclosure),
  };
  const sourceRequest = context.sourceRequest ?? base.interpretedIntent;
  const ownedBrandTerms = planningOwnedBrandTerms(context);
  const preserveRequestedOwnedTerms = context.selectionMode === "userSpecified";
  const normalizedBase = Object.freeze({
    ...base,
    suggestedTitleAngles: Object.freeze(base.suggestedTitleAngles.map((title) => stripUnrequestedOwnedPrefix(title, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms))),
  });
  const candidates = parseOpportunityCandidates(value.opportunityCandidates, {
    sourceRequest,
    projectId: context.projectId,
    selectionMode: context.selectionMode,
    hasVerifiedKeywordData: context.hasVerifiedKeywordData === true,
    ownedBrandTerms,
    preserveRequestedOwnedTerms,
  });
  if (candidates.length) return fromCandidates(normalizedBase, candidates, context.selectionMode);
  if (Array.isArray(value.opportunityCandidates)) throw new Error("AI planning response is missing a complete Content Opportunity.");

  const rawKeyword = text(value.recommendedPrimaryKeyword, "recommendedPrimaryKeyword");
  const selectedTopic = stripUnrequestedOwnedPrefix(first(normalizedBase.suggestedTitleAngles) ?? rawKeyword, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms);
  const keyword = normalizePlanningPrimaryKeyword(rawKeyword, selectedTopic, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms);
  const legacyCandidate = createContentOpportunityCandidate({
    sourceRequest,
    selectionMode: context.selectionMode,
    selectedTopic,
    primaryKeyword: keyword,
    secondaryKeywords: list(value.relatedKeywords),
    searchIntent: text(value.searchIntent, "searchIntent"),
    audience: normalizedBase.targetAudience,
    contentType: text(value.recommendedContentType, "recommendedContentType"),
    contentAngle: normalizedBase.contentGoal,
    readerProblem: normalizedBase.interpretedIntent,
    expectedCoverage: normalizedBase.contentCluster,
    selectionRationale: normalizedBase.recommendationReason,
    opportunityEvidence: [{ source: normalizedBase.confidence > 0 ? "estimated" : "unknown", summary: normalizedBase.estimateDisclosure }],
    confidence: normalizedBase.confidence,
    cautions: [normalizedBase.estimateDisclosure],
    projectId: context.projectId,
  });
  const legacyKeywords = list(value.keywordCandidates, [rawKeyword])
    .map((candidateKeyword) => normalizePlanningPrimaryKeyword(candidateKeyword, selectedTopic, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms));
  return fromCandidates(normalizedBase, [legacyCandidate], context.selectionMode, legacyKeywords);
}

function parseOpportunityCandidates(
  raw: unknown,
  context: Readonly<{ sourceRequest: string; projectId: string; selectionMode: ContentOpportunitySelectionMode; hasVerifiedKeywordData: boolean; ownedBrandTerms: readonly string[]; preserveRequestedOwnedTerms: boolean }>,
): readonly ContentOpportunityCandidate[] {
  if (!Array.isArray(raw)) return [];
  return Object.freeze(raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    try {
      const selectedTopic = stripUnrequestedOwnedPrefix(text(value.selectedTopic, "opportunity.selectedTopic"), context.sourceRequest, context.ownedBrandTerms, context.preserveRequestedOwnedTerms);
      const primaryKeyword = normalizePlanningPrimaryKeyword(
        text(value.primaryKeyword, "opportunity.primaryKeyword"),
        selectedTopic,
        context.sourceRequest,
        context.ownedBrandTerms,
        context.preserveRequestedOwnedTerms,
      );
      const searchIntent = text(value.searchIntent, "opportunity.searchIntent");
      const audience = text(value.audience, "opportunity.audience");
      const contentType = text(value.contentType, "opportunity.contentType");
      const readerProblem = text(value.readerProblem, "opportunity.readerProblem");
      const expectedCoverage = list(value.expectedCoverage);
      const candidate = createContentOpportunityCandidate({
        sourceRequest: context.sourceRequest,
        selectionMode: context.selectionMode,
        selectedTopic,
        primaryKeyword,
        secondaryKeywords: list(value.secondaryKeywords),
        searchIntent,
        audience,
        contentType,
        contentAngle: text(value.contentAngle, "opportunity.contentAngle"),
        readerProblem,
        expectedCoverage,
        qualityTarget: determineContentPlanQualityTarget({
          searchIntent,
          contentType,
          readerProblem,
          audience,
          selectedTopic,
          expectedCoverage,
          coreQuestions: list(value.coreQuestions),
          requiredContentElements: list(value.requiredContentElements),
          decisionCriteria: list(value.decisionCriteria),
          examplesNeeded: list(value.examplesNeeded),
          warningsOrExceptions: list(value.warningsOrExceptions),
          actionableNextSteps: list(value.actionableNextSteps),
          comparisonNeeds: list(value.comparisonNeeds),
          tableNeeds: value.tableNeeds === true,
          checklistNeeds: value.checklistNeeds === true,
          scopeBoundaries: list(value.scopeBoundaries),
          topicComplexity: normalizeTopicComplexity(value.topicComplexity),
          projectStrategy: typeof value.contentDepth === "string" ? value.contentDepth : undefined,
        }),
        selectionRationale: honestClaim(text(value.selectionRationale, "opportunity.selectionRationale"), context.hasVerifiedKeywordData),
        opportunityEvidence: evidence(value.opportunityEvidence, context.hasVerifiedKeywordData),
        confidence: confidence(value.confidence),
        cautions: list(value.cautions, [DISCLOSURE]),
        projectId: context.projectId,
      });
      if (context.selectionMode === "userSpecified" && !requestTopicCoherent(context.sourceRequest, candidate.selectedTopic)) return [];
      return [candidate];
    } catch {
      return [];
    }
  }));
}

function fromCandidates(
  base: Readonly<{
    interpretedIntent: string; domain: string; targetAudience: string; contentGoal: string;
    recommendedPlatforms: readonly string[]; suggestedTitleAngles: readonly string[]; contentCluster: readonly string[];
    recommendationReason: string; confidence: number; estimateDisclosure: string;
  }>,
  candidates: readonly ContentOpportunityCandidate[],
  selectionMode: ContentOpportunitySelectionMode,
  legacyKeywords?: readonly string[],
): ContentPlanningResult {
  const recommended = candidates[0];
  if (!recommended) throw new Error("AI planning response is missing a complete Content Opportunity.");
  return Object.freeze({
    ...base,
    targetAudience: recommended.audience,
    contentGoal: recommended.contentAngle,
    recommendedPrimaryKeyword: recommended.primaryKeyword,
    keywordCandidates: Object.freeze(legacyKeywords ?? candidates.map((item) => item.primaryKeyword)),
    searchIntent: recommended.searchIntent,
    recommendedContentType: recommended.contentType,
    suggestedTitleAngles: Object.freeze(base.suggestedTitleAngles.length ? base.suggestedTitleAngles : candidates.map((item) => item.selectedTopic)),
    relatedKeywords: recommended.secondaryKeywords,
    selectionMode,
    opportunityCandidates: Object.freeze(candidates),
    qualityTarget: recommended.qualityTarget,
  });
}

export function normalizePlanningPrimaryKeyword(
  primaryKeyword: string,
  selectedTopic: string,
  sourceRequest: string,
  ownedBrandTerms: readonly string[] = [],
  preserveRequestedOwnedTerms = true,
): string {
  const original = normalizedPhrase(primaryKeyword);
  const stripped = stripUnrequestedOwnedPrefix(original, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms);
  const keyword = stripped || original;
  const topic = stripUnrequestedOwnedPrefix(selectedTopic, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms);
  const keywordTokens = normalizedPhrase(keyword).split(/\s+/).filter(Boolean);
  const topicTokens = normalizedPhrase(topic).split(/\s+/).filter(Boolean);
  if (!keywordTokens.length || topicTokens.length <= keywordTokens.length) return keyword;
  const topicPrefix = topicTokens.slice(0, keywordTokens.length).join(" ").toLocaleLowerCase("ko-KR");
  if (topicPrefix !== keywordTokens.join(" ").toLocaleLowerCase("ko-KR")) return keyword;
  const modifier = topicTokens[keywordTokens.length];
  if (!modifier || !SEARCH_TASK_SUFFIXES.has(modifier) || SEARCH_TASK_SUFFIXES.has(keywordTokens[keywordTokens.length - 1] ?? "")) return keyword;
  return `${keyword} ${modifier}`;
}

function planningOwnedBrandTerms(context: Pick<ContentPlanningContext, "ownedBrandTerms" | "projectContext">): readonly string[] {
  const explicit = context.ownedBrandTerms ?? [];
  const contextual = projectIdentityTerms(context.projectContext);
  return Object.freeze([...new Set([...explicit, ...contextual].map(normalizedPhrase).filter(Boolean))].sort((left, right) => right.length - left.length));
}

function projectIdentityTerms(projectContext?: string): readonly string[] {
  if (!projectContext?.trim()) return [];
  try {
    const parsed = JSON.parse(projectContext) as Record<string, unknown>;
    const strategy = objectValue(parsed.projectStrategy) ?? parsed;
    const identity = objectValue(strategy.projectIdentity);
    if (!identity) return [];
    return [identity.projectName, identity.brandName]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  } catch {
    return [];
  }
}

function stripUnrequestedOwnedPrefix(
  value: string,
  sourceRequest: string,
  ownedBrandTerms: readonly string[],
  preserveRequestedOwnedTerms = true,
): string {
  const request = normalizedPhrase(sourceRequest).toLocaleLowerCase("ko-KR");
  let result = normalizedPhrase(value);
  for (const rawTerm of ownedBrandTerms) {
    const term = normalizedPhrase(rawTerm);
    if (!term || (preserveRequestedOwnedTerms && request.includes(term.toLocaleLowerCase("ko-KR")))) continue;
    const pattern = new RegExp(`^${escapeRegExp(term)}(?:\\s+|\\s*[-–—:|·]\\s*)`, "iu");
    const next = result.replace(pattern, "").trim();
    if (next) result = next;
  }
  return result;
}

function normalizedPhrase(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function evidence(value: unknown, hasVerifiedKeywordData: boolean) {
  if (!Array.isArray(value)) return Object.freeze([{ source: "unknown" as const, summary: DISCLOSURE }]);
  const values = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.summary !== "string" || !record.summary.trim()) return [];
    const requested = normalizeEvidenceSource(record.source);
    const source = requested === "verified" && !hasVerifiedKeywordData ? "estimated" as const : requested;
    return [{ source, summary: honestClaim(record.summary.trim(), hasVerifiedKeywordData) }];
  });
  return Object.freeze(values.length ? values : [{ source: "unknown" as const, summary: DISCLOSURE }]);
}

function normalizeEvidenceSource(value: unknown): OpportunityEvidenceSource {
  return value === "verified" || value === "estimated" || value === "inferred" ? value : "unknown";
}
function honestClaim(value: string, hasVerifiedKeywordData: boolean): string {
  if (hasVerifiedKeywordData) return value;
  return value
    .replace(/월간\s*[\d,.]+\s*(?:회|건|검색)?/gi, "월간 검색량 미검증")
    .replace(/검색량(?:이|은)?\s*높(?:다|음|은|습니다)/g, "검색 기회가 있다고 AI가 추정함")
    .replace(/많이\s*검색(?:된다|됨|됩니다)/g, "검색 관심이 있을 것으로 AI가 추정됨")
    .replace(/경쟁도(?:가|는)?\s*낮(?:다|음|은|습니다)/g, "경쟁 가능성이 낮을 것으로 AI가 추정됨")
    .replace(/검색\s*데이터\s*기반/g, "AI 분석 기반");
}
function requestTopicCoherent(request: string, selectedTopic: string): boolean {
  const ignored = new Set(["글", "콘텐츠", "작성", "만들어", "주세요", "해줘", "가이드", "방법", "관리", "대한", "관련", "article", "guide", "create", "write", "please"]);
  const terms = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term.length >= 2 && !ignored.has(term));
  const requestTerms = terms(request), topicTerms = terms(selectedTopic);
  return requestTerms.length === 0 || topicTerms.length === 0 || requestTerms.some((left) => topicTerms.some((right) => left.includes(right) || right.includes(left)));
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI planning response is missing ${name}.`);
  return value.trim();
}
function list(value: unknown, fallback: readonly string[] = []): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([...fallback]);
  const values = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return Object.freeze(values.length ? [...new Set(values)] : [...fallback]);
}
function confidence(value: unknown): number { return typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0; }
function normalizeTopicComplexity(value: unknown): "low" | "moderate" | "high" | undefined {
  return value === "low" || value === "moderate" || value === "high" ? value : undefined;
}
function disclosure(value: unknown): string { return typeof value === "string" && value.trim() ? `${value.trim()} ${DISCLOSURE}` : DISCLOSURE; }
function first(values: readonly string[]): string | undefined { return values[0]?.trim() || undefined; }
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
function normalizePlatform(value: string): WorkspacePlatform | undefined {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "tistory" || normalized === "wordpress" || normalized === "youtube" || normalized === "naver_cafe" ? normalized : undefined;
}
