import { AIProviderError, type AIProvider } from "../../core/ai";
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
import type { VerificationClaimKind, VerificationClaimRisk, VerificationClaimSpec, VerificationTemporalRequirement } from "../../core/approval";
import { verificationClaimId } from "../../core/approval";
import { createContentOpportunityVerificationPlan } from "../../core/content";
import { isExplicitVerificationPlanningEnabled } from "./ExplicitVerificationPlanningPolicy";
import { editorialDiversityPolicyFromContext } from "./approval/ApprovalContentPolicy";
export type { PlanningVerificationClaimDraft } from "./PlanningContracts";
import { planningVerificationClaimMaximum } from "./PlanningContracts";

const DISCLOSURE = "Keyword competition and opportunity are AI estimates, not measured search-volume, CPC, or competition data.";
const criticalVerificationKinds = new Set<VerificationClaimKind>([
  "money",
  "ratio",
  "date",
  "dateRange",
  "duration",
  "eligibility",
  "legal",
]);
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
  explicitVerificationPlanningEnabled?: boolean;
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
    const explicitVerificationPlanningEnabled = context.explicitVerificationPlanningEnabled ?? isExplicitVerificationPlanningEnabled();
    const modeInstruction = context.selectionMode === "automatic"
      ? "The user delegated topic selection. Compare content gaps, then return 2-4 complete and mutually coherent opportunities. Select topic and primary keyword together. Rank editorial value before SEO opportunity: first concrete reader usefulness, then factual defensibility, then complete search-intent resolution, then additional value beyond existing content, and only then competition, scarcity, trend, or other market opportunity. A rare or low-competition keyword is not a valid opportunity unless it solves a real reader problem."
      : "The user explicitly specified a topic. Keep every opportunity within that topic and search intent; never replace it with an adjacent topic because it seems more attractive.";
    const approvalSourceRequirementInstruction = explicitVerificationPlanningEnabled
      && typeof context.projectContext === "string"
      && context.projectContext.includes("Content purpose: adsense_approval")
      ? "Approval evidence policy is risk-based. Do not require sources for every approval-profile article. Return verificationClaims only for Claims that genuinely need external verification. Before returning, audit coreQuestions, warningsOrExceptions, expectedCoverage, requiredContentElements, and the content plan for factual premises about how an external system, institution, product, process, or rule works; every such premise must appear as an atomic VERIFY or CRITICAL Claim. Classify ordinary advice/checklists such as comparing receipts, checking large transactions first, grouping subscriptions, or contacting support as NONE by leaving them out. Use risk=verify for verifiable general facts that can be removed or generalized if unsupported. Use risk=critical and required=true only for money amounts, dates, eligibility, legal rules, tax rates, actual rates, official conditions, or similar facts that cannot safely remain without Evidence. If no VERIFY or CRITICAL Claim is needed, return an empty verificationClaims array; that explicit empty array is a valid completed N/A state. An empty array is a finding about the topic, not a way to make the article easier: a topic that produces one only because the article intends to state nothing checkable is the wrong topic. The article must inform the reader, not send them away to read their own documents, so requiredContentElements must name information the article itself states — how a rule or process actually works, what distinguishes one situation from another, what determines an outcome — and not only records the reader should go and look up. If the only honest plan for a topic is a list of things for the reader to check by themselves, choose a different topic."
      : "";
    const diversityInstruction = editorialDiversityInstruction(context.projectContext);
    const response = await this.provider.generate({
      instruction: `Analyze this content request as an editorial strategist. Do not write the final content. ${modeInstruction}
Request: ${request}
${explicitVerificationPlanningEnabled ? "Verification claims rule: expectedCoverage is editorial scope only. verificationClaims contains only concrete externally verifiable facts that need Evidence management. Each verificationClaims item must set atomicity to single_assertion and represent exactly one independently verifiable factual proposition. If the article needs separate facts such as definition, operator, scope, identity verification, and payout procedure, emit separate Claims with separate fields/statements; never combine them into one list-like statement. This is a structured contract rule, not a punctuation-based string-splitting rule. Each statement must be a factual proposition about the subject itself, not a task, an intention, or a deferral. Never write a statement whose predicate is that the value must be checked, is determined by law, follows the operator's rules, or any equivalent that names a process instead of asserting the fact; a statement of that shape carries no value for Evidence to confirm or contradict, and the article is written without the number the reader came for. You do not know the value yet and must not invent one, so name the exact value the article needs and leave the value itself to Evidence: field must identify that one value precisely, such as the discount rate of a plan rather than the plan itself. When the reader problem or search intent turns on an amount, a rate, a period, a deadline, an age or income threshold, or a count, emit at least one Claim of the matching kind for it: money, ratio, date, dateRange, or duration. Use risk=verify and required=false for verifiable general facts that are useful but can be removed or generalized if not verified. Use risk=critical and required=true for money, dates, eligibility, legal rules, tax rates, actual rates, official conditions, and other high-risk factual claims. Do not emit NONE claims; ordinary advice, checklists, generic steps, and editorial guidance belong only in coverage arrays. For approval-policy planning, an empty verificationClaims array is valid when no Evidence-managed Claim is needed. Exclude editorial instructions, section titles, search intent, strategy, and abstract facts; do not duplicate between arrays; never include claimId, fingerprint, status, normalizedValue, or source data. Every verification Claim must include temporalRequirement: use mode=current only for time-sensitive currently applicable values; mode=asOf with date YYYY-MM-DD for a value explicitly tied to one reference date; mode=period with start/end YYYY-MM-DD for an explicit historical/reference period; mode=notRequired when time validity is irrelevant; use mode=unknown when the temporal meaning cannot be safely classified. Never invent dates to satisfy this field." : ""}
${approvalSourceRequirementInstruction}
${diversityInstruction}
Project strategy: ${context.projectContext ?? "Use only the request and supplied project context."}
Project-owned labels that are identity, not default search keywords: ${JSON.stringify(ownedBrandTerms)}. Do not use these labels as the complete selectedTopic or primaryKeyword, and do not prefix selectedTopic or primaryKeyword with them unless the user's request explicitly makes that label the search subject. Keep third-party product, institution, and service names when they are genuinely part of the search task.
Existing content to avoid duplicating: ${(context.existingContent ?? []).join(" | ") || "none supplied"}
Server-verified Evidence bundle (read-only; never invent, alter, or add IDs/providers/metrics): ${JSON.stringify((context.evidenceBundle ?? []).map((value) => ({ evidenceId: value.evidenceId, provider: value.provider, evidenceType: value.evidenceType, metric: value.metric, keyword: value.keyword, topic: value.topic, pageUrl: value.pageUrl, periodStart: value.periodStart, periodEnd: value.periodEnd, freshness: value.freshness, verified: value.verified, value: value.value, unit: value.unit, relativeValue: value.relativeValue, changeRate: value.changeRate, limitations: value.limitations })))}
Enabled publishing platforms: ${enabledPlatforms ? (enabledPlatforms.join(", ") || "none") : "not restricted"}. ${enabledPlatforms ? "Recommend platforms only from this list." : ""}
Only the supplied server Evidence is factual. Do not invent monthly volume, CPC, competition scores, rankings, provider names, or popularity. NAVER/Trends ratios are relative, Search Console impressions are site impressions, GA4 is engagement, and AdSense scope must not be narrowed. Opportunity Evidence will be attached and classified by the server after your response; do not create Evidence IDs.
  Topic-selection policy: prefer a specific reader problem that the article can actually resolve. Do not choose a topic merely because search volume, trend, scarcity, or low competition appears attractive. Prefer claims that can be defended with the existing VERIFY/CRITICAL policy; describe conditional facts with their scope and exceptions instead of presenting one universal answer. Show additional value over Existing content in contentAngle, expectedCoverage, decisionCriteria, warningsOrExceptions, or actionableNextSteps. Project strategy defines the reusable domain and exclusions; do not hardcode a platform, site, or example topic. The Evidence bundle above covers only the subject areas the user happened to register, and a NAVER Connection holds at most five keywords, so it never describes the whole domain: when two topics are equally good for the reader, prefer the one whose subject area the bundle already covers, and otherwise ignore the bundle's coverage entirely. Never narrow, drop, or reshape a topic to make it overlap a bundle keyword.
  Return JSON only with top-level interpretedIntent, domain, targetAudience, contentGoal, recommendedPlatforms, suggestedTitleAngles, contentCluster, recommendationReason, confidence, estimateDisclosure, and opportunityCandidates. Each opportunity candidate must be one atomic plan containing selectedTopic, primaryKeyword, secondaryKeywords, searchIntent, audience, contentType, contentAngle, readerProblem, expectedCoverage, coreQuestions, requiredContentElements, decisionCriteria, examplesNeeded, warningsOrExceptions, actionableNextSteps, comparisonNeeds, tableNeeds, checklistNeeds, scopeBoundaries, topicComplexity, contentDepth, selectionRationale, opportunityEvidence [{source,summary}], confidence, and cautions. contentDepth must be standard, deep, or comparison; never return quick. Do not return any prose-length or section-length targets.
  Build each candidate as a coherent information contract before returning it. The primaryKeyword must be the concise phrase a reader would actually search, including a task modifier such as 방법, 비교, 기준, 조건, 계산, 신청, or 설정 when that modifier is essential to the search intent. The selectedTopic should naturally contain the primaryKeyword phrase when that reads well; otherwise it must preserve all of the keyword's core concepts without switching to an adjacent search task. Opportunity alignment measures how much of the primaryKeyword the selectedTopic carries and blocks the article below 60 percent, so do not drop the keyword's task modifier from the topic to make it read differently. Title shape is varied when the article is written, not by loosening the topic. searchIntent must state the concrete question or task the reader wants resolved, not only a classification label such as informational, transactional, commercial, or navigational. readerProblem must describe the reader's decision or action obstacle. Make coreQuestions directly answerable, make requiredContentElements concrete enough to judge as missing/mentioned/sufficient, and keep expectedCoverage items mutually distinct. decisionCriteria, examplesNeeded, warningsOrExceptions, and actionableNextSteps must each add a non-duplicative editorial role. Required elements identify information the reader needs, not merely words that should appear. Topic, keyword, intent, coverage, and supporting keywords in each candidate must describe one search task. comparisonNeeds, tableNeeds, and checklistNeeds are judgments about this one topic, not defaults: set each true only when the topic itself supplies the material for it. Set tableNeeds true only when the article will hold at least three rows of comparable data sharing the same columns; a table is scored by how many data rows it carries, so a table declared without data to fill it lowers the article's information score instead of raising it. Set checklistNeeds true whenever the reader has to confirm several separate conditions, documents or records before acting, which is usual for eligibility, application and preparation topics; do not set it false merely because actionableNextSteps also exists. Returning the same combination of these three flags on every candidate means they were copied rather than judged; candidates whose topics differ should differ here.`,
      metadata: { task: "content-planning", ...(explicitVerificationPlanningEnabled ? { explicitVerificationPlanning: "1" } : {}) },
    });
    let plan: ContentPlanningResult;
    try {
      plan = parsePlanningResult(response.content, { ...context, ownedBrandTerms, sourceRequest: request, explicitVerificationPlanningEnabled });
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw AIProviderError.parse({
        stage: "planning",
        message: error instanceof Error ? error.message : "Planning response could not be parsed.",
        diagnostic: response.diagnostics,
      });
    }
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
  context: (Pick<ContentPlanningContext, "projectId" | "selectionMode" | "hasVerifiedKeywordData" | "ownedBrandTerms" | "projectContext" | "explicitVerificationPlanningEnabled"> & { sourceRequest?: string }) = { projectId: "planning-project", selectionMode: "userSpecified" },
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
    suggestedTitleAngles: Object.freeze(base.suggestedTitleAngles
      .map((title) => stripUnrequestedOwnedPrefix(title, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms))
      .filter(Boolean)),
  });
  const candidates = parseOpportunityCandidates(value.opportunityCandidates, {
    sourceRequest,
    projectId: context.projectId,
    selectionMode: context.selectionMode,
    hasVerifiedKeywordData: context.hasVerifiedKeywordData === true,
    ownedBrandTerms,
    preserveRequestedOwnedTerms,
    explicitVerificationPlanningEnabled: context.explicitVerificationPlanningEnabled ?? isExplicitVerificationPlanningEnabled(),
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
    .map((candidateKeyword) => normalizePlanningPrimaryKeyword(candidateKeyword, selectedTopic, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms))
    .filter(Boolean);
  return fromCandidates(normalizedBase, [legacyCandidate], context.selectionMode, legacyKeywords);
}

function parseOpportunityCandidates(
  raw: unknown,
  context: Readonly<{ sourceRequest: string; projectId: string; selectionMode: ContentOpportunitySelectionMode; hasVerifiedKeywordData: boolean; ownedBrandTerms: readonly string[]; preserveRequestedOwnedTerms: boolean; explicitVerificationPlanningEnabled: boolean }>,
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
      if (!selectedTopic || !primaryKeyword) return [];
      const searchIntent = text(value.searchIntent, "opportunity.searchIntent");
      const audience = text(value.audience, "opportunity.audience");
      const contentType = text(value.contentType, "opportunity.contentType");
      const readerProblem = text(value.readerProblem, "opportunity.readerProblem");
      const expectedCoverage = list(value.expectedCoverage);
      const verificationPlan = context.explicitVerificationPlanningEnabled ? createPlanningVerificationPlan(value.verificationClaims) : undefined;
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
        ...(verificationPlan ? { verificationPlan } : {}),
      });
      if (context.selectionMode === "userSpecified" && !requestTopicCoherent(context.sourceRequest, candidate.selectedTopic)) return [];
      return [candidate];
    } catch (error) {
      if (context.explicitVerificationPlanningEnabled) throw error;
      return [];
    }
  }));
}

function createPlanningVerificationPlan(raw: unknown) {
  if (!Array.isArray(raw) || raw.length > planningVerificationClaimMaximum) throw new Error("Explicit planning response requires verificationClaims array.");
  const seen = new Set<string>();
  const claims = raw.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Invalid verification claim at index ${index}.`);
    const value = item as Record<string, unknown>;
    const kinds = ["money", "ratio", "date", "dateRange", "duration", "location", "eligibility", "legal", "general"];
    if (!kinds.includes(value.kind as string)) throw new Error(`Invalid verification claim kind at index ${index}.`);
    const textValue = (name: string) => { if (typeof value[name] !== "string" || !(value[name] as string).trim()) throw new Error(`Invalid verification claim ${name} at index ${index}.`); return (value[name] as string).trim(); };
    if (typeof value.required !== "boolean" || !value.qualifiers || typeof value.qualifiers !== "object" || Array.isArray(value.qualifiers)) throw new Error(`Invalid verification claim at index ${index}.`);
    const qualifiers = Object.freeze(Object.fromEntries(Object.entries(value.qualifiers as Record<string, unknown>).map(([key, itemValue]) => { if (!["subject", "scope", "basis", "note"].includes(key) || typeof itemValue !== "string") throw new Error(`Invalid verification qualifier at index ${index}.`); return [key, itemValue.trim()]; })));
    const temporalRequirement = parsePlanningTemporalRequirement(value.temporalRequirement, index);
    if (value.atomicity !== "single_assertion") throw new Error(`Verification claim must declare atomicity=single_assertion at index ${index}.`);
    const risk = parsePlanningClaimRisk(value.risk, value.required, value.kind as VerificationClaimKind, index);
    const draft = { atomicity: "single_assertion" as const, field: textValue("field"), kind: value.kind as VerificationClaimKind, statement: textValue("statement").replace(/\s+/g, " "), ...(typeof value.rawValue === "string" && value.rawValue.trim() ? { rawValue: value.rawValue.trim() } : {}), qualifiers, temporalRequirement, required: risk === "critical", risk, ...(typeof value.policyId === "string" && value.policyId.trim() ? { policyId: value.policyId.trim() } : {}) } as Omit<VerificationClaimSpec, "claimId">;
    const claim = Object.freeze({ ...draft, claimId: verificationClaimId(draft) });
    if (seen.has(claim.claimId)) throw new Error(`Duplicate verification claim at index ${index}.`);
    seen.add(claim.claimId);
    return claim;
  });
  return createContentOpportunityVerificationPlan(claims);
}

/**
 * The kind floor is authoritative, not a fallback. It used to apply only when
 * the model omitted `risk`, so a model that answered `verify` on an
 * `eligibility` Claim silently opted the whole article out of Evidence: with no
 * critical Claim, `runApprovalSourcePreflight` returns `not_required` with zero
 * sources, generation writes with nothing to cite, and the critical statements
 * it invents anyway are deleted as `unreported_generated_critical`. A 청약통장
 * article planned four eligibility Claims that way and published with no 출처
 * section at all.
 *
 * The planning prompt already names eligibility, legal, money, dates and
 * durations as the critical set, so this enforces the instruction rather than
 * adding a rule. A model may still raise a `general` Claim to critical; it may
 * no longer lower a kind that is critical by nature.
 */
function parsePlanningClaimRisk(
  raw: unknown,
  required: boolean,
  kind: VerificationClaimKind,
  index: number,
): VerificationClaimRisk {
  if (raw !== undefined && raw !== "none" && raw !== "verify" && raw !== "critical") {
    throw new Error(`Invalid verification claim risk at index ${index}.`);
  }
  if (required || criticalVerificationKinds.has(kind) || raw === "critical") return "critical";
  return raw === "none" ? "none" : "verify";
}

function parsePlanningTemporalRequirement(raw: unknown, index: number): VerificationTemporalRequirement {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid verification temporalRequirement at index ${index}.`);
  const value = raw as Record<string, unknown>;
  const mode = value.mode;
  if (mode === "current" || mode === "notRequired" || mode === "unknown") {
    if (hasTemporalDateValue(value.date) || hasTemporalDateValue(value.start) || hasTemporalDateValue(value.end)) throw new Error(`Unexpected verification temporal date at index ${index}.`);
    return Object.freeze({ mode });
  }
  if (mode === "asOf") {
    const date = strictPlanningDate(value.date, `verification temporal date at index ${index}`);
    if (hasTemporalDateValue(value.start) || hasTemporalDateValue(value.end)) throw new Error(`Unexpected verification temporal period at index ${index}.`);
    return Object.freeze({ mode, date });
  }
  if (mode === "period") {
    const start = strictPlanningDate(value.start, `verification temporal start at index ${index}`);
    const end = strictPlanningDate(value.end, `verification temporal end at index ${index}`);
    if (start > end || hasTemporalDateValue(value.date)) throw new Error(`Invalid verification temporal period at index ${index}.`);
    return Object.freeze({ mode, start, end });
  }
  throw new Error(`Invalid verification temporal mode at index ${index}.`);
}

function strictPlanningDate(raw: unknown, field: string): string {
  if (typeof raw !== "string" || !/^20\d{2}-\d{2}-\d{2}$/u.test(raw.trim())) throw new Error(`Invalid ${field}.`);
  const value = raw.trim();
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) throw new Error(`Invalid ${field}.`);
  return value;
}
function hasTemporalDateValue(value: unknown): boolean { return typeof value === "string" ? Boolean(value.trim()) : value !== undefined; }

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
  const keyword = stripUnrequestedOwnedPrefix(original, sourceRequest, ownedBrandTerms, preserveRequestedOwnedTerms);
  if (!keyword) return "";
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

/**
 * The diversity policy travels inside the editorial context JSON, where it sat
 * below the prompt's own instruction to put a task modifier in every
 * primaryKeyword and mirror that keyword in selectedTopic. Every candidate came
 * back shaped `<주제> 방법: <설명절>` even while the policy named that exact shape
 * as the one to avoid. Restating it here gives it the same rank as the
 * instruction it has to overcome.
 */
function editorialDiversityInstruction(projectContext: string | undefined): string {
  const policy = editorialDiversityPolicyFromContext(projectContext);
  if (!policy) return "";
  const recent = (policy.recentArticles ?? []).flatMap((article) => {
    const title = article.title?.trim();
    if (!title) return [];
    const headings = (article.headings ?? []).filter(Boolean).join(" / ");
    const opening = article.openingSentence?.trim();
    return [[
      `제목: ${title}`,
      headings ? `소제목: ${headings}` : "",
      opening ? `도입부: ${opening}` : "",
    ].filter(Boolean).join(" | ")];
  });
  const formats = (policy.formatOptions ?? [])
    .map((option) => `${option.name}(${option.id}): ${option.skeleton} — ${option.fitsWhen}`);
  return [
    "Editorial diversity contract (this outranks any wording convention below; it never outranks factual accuracy or the approval policy):",
    policy.rule,
    recent.length ? `이 사이트가 최근 발행한 글:\n${recent.join("\n")}` : "",
    "위 제목들의 문형을 selectedTopic, suggestedTitleAngles, contentAngle에서 되풀이하지 말 것. 후보 여러 개를 반환할 때는 후보끼리도 제목 문형이 서로 달라야 한다.",
    formats.length ? `${policy.formatRule ?? ""}\n${formats.join("\n")}` : "",
    (policy.introStyles ?? []).length ? `도입부 화법 예시: ${(policy.introStyles ?? []).join(" / ")}` : "",
  ].filter(Boolean).join("\n");
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
    if (result.toLocaleLowerCase("ko-KR") === term.toLocaleLowerCase("ko-KR")) {
      result = "";
      break;
    }
    const pattern = new RegExp(`^${escapeRegExp(term)}(?:\\s+|\\s*[-–—:|·]\\s*)`, "iu");
    const next = result.replace(pattern, "").trim();
    if (next !== result) result = next;
    if (!result) break;
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
