import type { AIProvider } from "../../core/ai";
import {
  createContentOpportunityCandidate,
  type ContentOpportunityCandidate,
  type ContentOpportunitySelectionMode,
  type OpportunityEvidenceSource,
} from "../../core/content";
import type { ContentPlanningResult, WorkspacePlatform } from "../user-flow/user-data";
import type { OpportunityEvidenceRecord } from "../../core/intelligence";

const DISCLOSURE = "Keyword competition and opportunity are AI estimates, not measured search-volume, CPC, or competition data.";

export type ContentPlanningContext = Readonly<{
  projectId: string;
  selectionMode: ContentOpportunitySelectionMode;
  projectContext?: string;
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
    const modeInstruction = context.selectionMode === "automatic"
      ? "The user delegated topic selection. Compare content gaps, then return 2-4 complete and mutually coherent opportunities. Select topic and primary keyword together."
      : "The user explicitly specified a topic. Keep every opportunity within that topic and search intent; never replace it with an adjacent topic because it seems more attractive.";
    const response = await this.provider.generate({
      instruction: `Analyze this content request as an editorial strategist. Do not write the final content. ${modeInstruction}
Request: ${request}
Project strategy: ${context.projectContext ?? "Use only the request and supplied project context."}
Existing content to avoid duplicating: ${(context.existingContent ?? []).join(" | ") || "none supplied"}
Server-verified Evidence bundle (read-only; never invent, alter, or add IDs/providers/metrics): ${JSON.stringify((context.evidenceBundle ?? []).map((value) => ({ evidenceId: value.evidenceId, provider: value.provider, evidenceType: value.evidenceType, metric: value.metric, keyword: value.keyword, topic: value.topic, pageUrl: value.pageUrl, periodStart: value.periodStart, periodEnd: value.periodEnd, freshness: value.freshness, verified: value.verified, value: value.value, unit: value.unit, relativeValue: value.relativeValue, changeRate: value.changeRate, limitations: value.limitations })))}
Enabled publishing platforms: ${enabledPlatforms ? (enabledPlatforms.join(", ") || "none") : "not restricted"}. ${enabledPlatforms ? "Recommend platforms only from this list." : ""}
Only the supplied server Evidence is factual. Do not invent monthly volume, CPC, competition scores, rankings, provider names, or popularity. NAVER/Trends ratios are relative, Search Console impressions are site impressions, GA4 is engagement, and AdSense scope must not be narrowed. Opportunity Evidence will be attached and classified by the server after your response; do not create Evidence IDs.
Return JSON only with top-level interpretedIntent, domain, targetAudience, contentGoal, recommendedPlatforms, suggestedTitleAngles, contentCluster, recommendationReason, confidence, estimateDisclosure, and opportunityCandidates. Each opportunity candidate must be one atomic plan containing selectedTopic, primaryKeyword, secondaryKeywords, searchIntent, audience, contentType, contentAngle, readerProblem, expectedCoverage, selectionRationale, opportunityEvidence [{source,summary}], confidence, and cautions. Topic, keyword, intent, coverage, and supporting keywords in each candidate must describe one search task.`,
      metadata: { task: "content-planning" },
    });
    const plan = parsePlanningResult(response.content, { ...context, sourceRequest: request });
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
  context: (Pick<ContentPlanningContext, "projectId" | "selectionMode" | "hasVerifiedKeywordData"> & { sourceRequest?: string }) = { projectId: "planning-project", selectionMode: "userSpecified" },
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
  const candidates = parseOpportunityCandidates(value.opportunityCandidates, {
    sourceRequest,
    projectId: context.projectId,
    selectionMode: context.selectionMode,
    hasVerifiedKeywordData: context.hasVerifiedKeywordData === true,
  });
  if (candidates.length) return fromCandidates(base, candidates, context.selectionMode);
  if (Array.isArray(value.opportunityCandidates)) throw new Error("AI planning response is missing a complete Content Opportunity.");

  const keyword = text(value.recommendedPrimaryKeyword, "recommendedPrimaryKeyword");
  const legacyCandidate = createContentOpportunityCandidate({
    sourceRequest,
    selectionMode: context.selectionMode,
    selectedTopic: first(base.suggestedTitleAngles) ?? keyword,
    primaryKeyword: keyword,
    secondaryKeywords: list(value.relatedKeywords),
    searchIntent: text(value.searchIntent, "searchIntent"),
    audience: base.targetAudience,
    contentType: text(value.recommendedContentType, "recommendedContentType"),
    contentAngle: base.contentGoal,
    readerProblem: base.interpretedIntent,
    expectedCoverage: base.contentCluster,
    selectionRationale: base.recommendationReason,
    opportunityEvidence: [{ source: base.confidence > 0 ? "estimated" : "unknown", summary: base.estimateDisclosure }],
    confidence: base.confidence,
    cautions: [base.estimateDisclosure],
    projectId: context.projectId,
  });
  return fromCandidates(base, [legacyCandidate], context.selectionMode, list(value.keywordCandidates, [keyword]));
}

function parseOpportunityCandidates(
  raw: unknown,
  context: Readonly<{ sourceRequest: string; projectId: string; selectionMode: ContentOpportunitySelectionMode; hasVerifiedKeywordData: boolean }>,
): readonly ContentOpportunityCandidate[] {
  if (!Array.isArray(raw)) return [];
  return Object.freeze(raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    try {
      const candidate = createContentOpportunityCandidate({
        sourceRequest: context.sourceRequest,
        selectionMode: context.selectionMode,
        selectedTopic: text(value.selectedTopic, "opportunity.selectedTopic"),
        primaryKeyword: text(value.primaryKeyword, "opportunity.primaryKeyword"),
        secondaryKeywords: list(value.secondaryKeywords),
        searchIntent: text(value.searchIntent, "opportunity.searchIntent"),
        audience: text(value.audience, "opportunity.audience"),
        contentType: text(value.contentType, "opportunity.contentType"),
        contentAngle: text(value.contentAngle, "opportunity.contentAngle"),
        readerProblem: text(value.readerProblem, "opportunity.readerProblem"),
        expectedCoverage: list(value.expectedCoverage),
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
  });
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
function disclosure(value: unknown): string { return typeof value === "string" && value.trim() ? `${value.trim()} ${DISCLOSURE}` : DISCLOSURE; }
function first(values: readonly string[]): string | undefined { return values[0]?.trim() || undefined; }
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
function normalizePlatform(value: string): WorkspacePlatform | undefined {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "tistory" || normalized === "wordpress" || normalized === "youtube" || normalized === "naver_cafe" ? normalized : undefined;
}
