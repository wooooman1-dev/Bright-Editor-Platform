import {
  assessOpportunityEditorialValue,
  assessOpportunityRecommendation,
  calculateFreshness,
  compareOpportunityEditorialValue,
  createOpportunityEvidence,
  recommendationTypePriority,
  type DataSourceConnectionRepository,
  type OpportunityEvidenceRecord,
  type OpportunityEvidenceRepository,
  type ProjectDataSourceReferenceRepository,
} from "../../../core/intelligence";
import { createContentOpportunityCandidate, type ContentOpportunityCandidate, type OpportunityEvidence } from "../../../core/content";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";

/**
 * A topic the planner proposed and classification refused to offer.
 *
 * Refusing is correct — a duplicate or off-strategy topic must not be
 * selectable — but the refusal used to leave no trace at all, so a Planning run
 * that proposed three topics and showed two looked like the product had lost
 * one. Approval preparation represents its verdicts as states rather than
 * silently acting on them, and this is one of those verdicts.
 */
export type ExcludedOpportunity = Readonly<{
  selectedTopic: string;
  primaryKeyword: string;
  reason: string;
}>;

export type ClassifiedOpportunities = Readonly<{
  candidates: readonly ContentOpportunityCandidate[];
  excluded: readonly ExcludedOpportunity[];
}>;

export class OpportunityEvidenceService {
  constructor(
    private readonly connections: DataSourceConnectionRepository,
    private readonly references: ProjectDataSourceReferenceRepository,
    private readonly repository: OpportunityEvidenceRepository,
  ) {}

  async buildPlanningBundle(data: UserData, project: UserProject, currentContentId?: string): Promise<readonly OpportunityEvidenceRecord[]> {
    const startedAt = Date.now();
    const diag = (stage: string) => console.info(`[PLANNING-DIAG] ${stage}: ${Date.now() - startedAt}ms`);
    diag("bundle-start");
    if (data.workspace?.id !== project.workspaceId) throw new Error("Project does not belong to the current Workspace.");
    diag("references-list-start");
    const references = (await this.references.listByProject(project.id)).filter((value) => value.workspaceId === project.workspaceId && value.enabled);
    diag("references-list-complete");
    const allowedIds = new Set(references.map((value) => value.connectionId));
    diag("connections-list-start");
    const connections = (await this.connections.listByWorkspace(project.workspaceId)).filter((value) => allowedIds.has(value.id) && value.enabled && value.status !== "disconnected");
    diag("connections-list-complete");
    const allowedConnectionIds = new Set(connections.map((value) => value.id));
    diag("repository-list-start");
    const external = (await this.repository.listByWorkspace(project.workspaceId))
      .filter((value) => value.projectId == null && Boolean(value.connectionId && allowedConnectionIds.has(value.connectionId)))
      .filter((value) => Boolean(value.keyword || value.topic || value.pageUrl))
      .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))
      .slice(0, 100)
      .map((value) => value.provider === "brightStudio" ? value : Object.freeze({ ...value, freshness: calculateFreshness(value.provider, value.syncedAt) }));
    diag("repository-list-complete");
    const internal = buildInternalGrowthEvidence(data, project, currentContentId);
    await this.repository.saveMany(internal);
    const result = Object.freeze([...external, ...internal]);
    diag("bundle-complete");
    return result;
  }

  classifyCandidates(candidates: readonly ContentOpportunityCandidate[], bundle: readonly OpportunityEvidenceRecord[], data: UserData, project: UserProject): ClassifiedOpportunities {
    const published = publicContents(data, project.id);
    const excluded: ExcludedOpportunity[] = [];
    const classified = candidates.flatMap((candidate) => {
      const matched = matchEvidence(candidate, bundle, project);
      const duplicate = published.some((content) => isDirectDuplicate(candidate, content));
      const aligned = projectAligned(candidate, project);
      const excludedByProject = projectExcluded(candidate, project);
      const searchIntentClear = candidate.searchIntent.trim().length >= 4;
      const safe = safetyPassed(candidate);
      const editorialValue = assessOpportunityEditorialValue({
        selectedTopic: candidate.selectedTopic,
        primaryKeyword: candidate.primaryKeyword,
        searchIntent: candidate.searchIntent,
        readerProblem: candidate.readerProblem,
        contentAngle: candidate.contentAngle,
        selectionRationale: candidate.selectionRationale,
        expectedCoverage: candidate.expectedCoverage,
        coreQuestions: candidate.qualityTarget.coreQuestions,
        decisionCriteria: candidate.qualityTarget.decisionCriteria,
        warningsOrExceptions: candidate.qualityTarget.warningsOrExceptions,
        actionableNextSteps: candidate.qualityTarget.actionableNextSteps,
        scopeBoundaries: candidate.qualityTarget.scopeBoundaries,
        verificationClaimCount: candidate.verificationPlan?.claims.length ?? 0,
        duplicate,
        projectAligned: aligned,
        projectExcluded: excludedByProject,
      });
      const assessment = assessOpportunityRecommendation({
        evidence: matched,
        duplicate,
        projectAligned: aligned,
        searchIntentClear,
        safetyPassed: safe && editorialValue.eligible,
      });
      const userSpecifiedFallback = candidate.selectionMode === "userSpecified" && searchIntentClear && safe;
      const recommendationType = assessment.recommendationType ?? (userSpecifiedFallback ? "blogGrowth" as const : undefined);
      if (!recommendationType) {
        excluded.push(Object.freeze({
          selectedTopic: candidate.selectedTopic,
          primaryKeyword: candidate.primaryKeyword,
          reason: exclusionReason({ duplicate, aligned, excluded: excludedByProject, searchIntentClear, safe, editorialValue }),
        }));
        return [];
      }
      const evidenceConfidence = averageVerifiedEvidenceConfidence(matched);
      const summaries = matched.map(toOpportunityEvidence);
      const limitations = [...assessment.limitations, ...editorialValue.limitations];
      if (userSpecifiedFallback && !matched.length) limitations.push("사용자가 직접 지정한 주제이므로 외부 시장 Evidence 없이 계속 진행합니다. 검색 수요와 성과 가능성은 검증되지 않았습니다.");
      if (userSpecifiedFallback && duplicate) limitations.push("현재 Project에 유사한 공개 콘텐츠가 있을 수 있습니다. 중복 여부를 확인해 주세요.");
      if (userSpecifiedFallback && !aligned) limitations.push("현재 Project 전략과의 연관성이 자동으로 확인되지 않았습니다. 사용자가 지정한 주제를 우선하여 계속 진행합니다.");
      return [{ candidate: createContentOpportunityCandidate({
        ...candidate,
        opportunityEvidence: summaries,
        recommendationType,
        evidenceIds: matched.map((value) => value.evidenceId),
        marketEvidenceStatus: assessment.marketEvidenceStatus,
        internalGrowthEvidenceStatus: assessment.internalGrowthEvidenceStatus,
        freshness: assessment.freshness,
        limitations: Object.freeze([...new Set(limitations)]),
        classificationVersion: 1,
        confidence: evidenceConfidence !== undefined
          ? evidenceConfidence
          : userSpecifiedFallback ? Math.min(candidate.confidence, 0.55) : 0,
        cautions: candidate.cautions,
        projectId: project.id,
      }), editorialValue }];
    });
    return Object.freeze({
      candidates: Object.freeze(classified.sort((left, right) => compareOpportunityEditorialValue(left.editorialValue, right.editorialValue)
        || recommendationTypePriority(left.candidate.recommendationType) - recommendationTypePriority(right.candidate.recommendationType)
        || verifiedCount(right.candidate) - verifiedCount(left.candidate)
        || freshnessPriority(left.candidate.freshness) - freshnessPriority(right.candidate.freshness)
        || left.candidate.opportunityId.localeCompare(right.candidate.opportunityId))
        .map((value) => value.candidate)),
      excluded: Object.freeze(excluded),
    });
  }

  async assertWorkspaceEvidenceIds(workspaceId: string, ids: readonly string[]): Promise<void> {
    for (const id of [...new Set(ids)]) {
      const evidence = await this.repository.findById(id);
      if (!evidence || evidence.workspaceId !== workspaceId) throw new Error("Content Opportunity contains invalid or cross-Workspace Evidence.");
    }
  }

  async assertOpportunityEvidenceBindings(workspaceId: string, opportunities: readonly Pick<ContentOpportunityCandidate, "projectId" | "evidenceIds">[]): Promise<void> {
    for (const opportunity of opportunities) {
      for (const id of [...new Set(opportunity.evidenceIds ?? [])]) {
        const evidence = await this.repository.findById(id);
        if (!evidence || evidence.workspaceId !== workspaceId) throw new Error("Content Opportunity contains invalid or cross-Workspace Evidence.");
        if (evidence.projectId != null && evidence.projectId !== opportunity.projectId) {
          throw new Error("Content Opportunity contains cross-Project Evidence.");
        }
      }
    }
  }
}

function buildInternalGrowthEvidence(data: UserData, project: UserProject, currentContentId?: string): readonly OpportunityEvidenceRecord[] {
  const published = publicContents(data, project.id).filter((value) => value.id !== currentContentId), strategy = project.strategy;
  const observedAt = new Date().toISOString().slice(0, 10), common = { workspaceId: project.workspaceId, projectId: project.id, provider: "brightStudio" as const, observedAt, syncedAt: observedAt, freshness: "fresh" as const, verified: true, version: 1 as const, confidence: 0.75, rawSnapshotReference: undefined };
  const limitations = ["Internal growth Evidence is not external market demand.", "A dedicated Content Library projection is not implemented; only current Project metadata and verified public URLs are used."];
  const result: OpportunityEvidenceRecord[] = [createOpportunityEvidence({ ...common, evidenceType: "contentGap", topic: strategy?.primaryTopic ?? project.name, keyword: strategy?.subtopics?.[0] ?? strategy?.primaryTopic ?? project.name, value: published.length, unit: "publishedContentCount", limitations, sourceReference: `project:${project.id}:content-gap`, resourceScope: "project" })];
  if (published.length) {
    result.push(createOpportunityEvidence({ ...common, confidence: 0.9, evidenceType: "clusterOpportunity", topic: strategy?.primaryTopic ?? project.name, value: published.length, unit: "verifiedPublicContentCount", limitations, sourceReference: `project:${project.id}:cluster`, resourceScope: "project" }));
    published.forEach((content) => result.push(createOpportunityEvidence({ ...common, confidence: 0.9, evidenceType: "internalLinkOpportunity", topic: content.title, keyword: content.primaryKeyword, contentId: content.id, pageUrl: content.publishedUrl, value: 1, unit: "verifiedPublicPage", limitations: ["This Evidence identifies a verified public internal-link target; it does not measure search volume."], sourceReference: `content:${content.id}:public-url`, resourceScope: "page" })));
  }
  return Object.freeze(result);
}

/**
 * Names why a proposed topic could not be offered.
 *
 * The checks are reported in the order that decides the answer for the reader:
 * an off-strategy topic is off-strategy whether or not it also duplicates
 * something, and knowing it duplicates an existing article is more actionable
 * than being told its search intent was thin. The editorial-value assessment
 * already phrases its own findings, so those are passed through rather than
 * restated.
 */
function exclusionReason(input: Readonly<{
  duplicate: boolean;
  aligned: boolean;
  excluded: boolean;
  searchIntentClear: boolean;
  safe: boolean;
  editorialValue: Readonly<{ eligible: boolean; limitations: readonly string[] }>;
}>): string {
  if (input.excluded) return "Project에서 제외한 주제입니다.";
  if (!input.aligned) return "Project 전략과 연관성이 확인되지 않았습니다.";
  if (input.duplicate) return "이미 공개된 콘텐츠와 주제가 중복됩니다.";
  if (!input.searchIntentClear) return "검색 의도가 판단할 만큼 구체적이지 않습니다.";
  if (!input.safe) return "안전성 기준을 통과하지 못했습니다.";
  if (!input.editorialValue.eligible) {
    return input.editorialValue.limitations[0] ?? "편집 가치 기준을 충족하지 못했습니다.";
  }
  return "추천 기준을 충족하지 못했습니다.";
}

function publicContents(data: UserData, projectId: string): UserContent[] { return data.contents.filter((value): value is UserContent & { publishedUrl: string } => value.projectId === projectId && typeof value.publishedUrl === "string" && /^https?:\/\//i.test(value.publishedUrl)); }
function matchEvidence(candidate: ContentOpportunityCandidate, bundle: readonly OpportunityEvidenceRecord[], project: UserProject): readonly OpportunityEvidenceRecord[] {
  const terms = meaningful(`${candidate.selectedTopic} ${candidate.primaryKeyword} ${candidate.secondaryKeywords.join(" ")}`);
  return Object.freeze(bundle.filter((value) => {
    if (value.workspaceId !== project.workspaceId) return false;
    if (value.projectId && value.projectId !== candidate.projectId) return false;
    if (value.evidenceType === "contentGap" && value.projectId === candidate.projectId) return true;
    if (value.evidenceType === "clusterOpportunity") return overlap(terms, meaningful(`${value.topic ?? ""} ${value.keyword ?? ""}`));
    const sourceTerms = meaningful(`${value.keyword ?? ""} ${value.topic ?? ""} ${value.pageUrl ?? ""}`);
    return sourceTerms.length > 0 && overlap(terms, sourceTerms);
  }));
}
function toOpportunityEvidence(value: OpportunityEvidenceRecord): OpportunityEvidence {
  const period = value.periodStart || value.periodEnd ? `${value.periodStart ?? "?"}~${value.periodEnd ?? "?"}` : "내부 현재 상태";
  return Object.freeze({ source: value.provider === "brightStudio" ? "inferred" : value.verified ? "verified" : "unknown", summary: `${value.provider} · ${value.evidenceType}${value.metric ? ` · ${value.metric}` : ""}${value.value != null ? ` · ${String(value.value)} ${value.unit ?? ""}` : ""}`, evidenceId: value.evidenceId, provider: value.provider, evidenceType: value.evidenceType, metric: value.metric, periodStart: value.periodStart, periodEnd: value.periodEnd, freshness: value.freshness, verified: value.verified, limitation: value.limitations.join(" "), sourceReference: `${value.sourceReference} (${period})` });
}
function isDirectDuplicate(candidate: ContentOpportunityCandidate, content: UserContent): boolean { const left = normalize(candidate.primaryKeyword), right = normalize(content.primaryKeyword ?? content.title); return Boolean(left && right && (left === right || normalize(candidate.selectedTopic) === normalize(content.title))); }
function projectAligned(candidate: ContentOpportunityCandidate, project: UserProject): boolean {
  const strategy = project.strategy;
  if (!strategy && !project.description.trim()) return true;
  const source = meaningful(`${strategy?.primaryTopic ?? project.name} ${(strategy?.subtopics ?? []).join(" ")} ${project.description}`);
  if (source.length === 0) return true;
  const candidateTerms = meaningful(`${candidate.selectedTopic} ${candidate.primaryKeyword}`);
  if (overlap(candidateTerms, source)) return true;
  return candidate.selectionMode === "automatic" && overlap(meaningful(candidate.sourceRequest), source);
}
function safetyPassed(candidate: ContentOpportunityCandidate): boolean { return !/(?:완치|치료\s*보장|진단\s*확정|약을\s*끊)/i.test(`${candidate.selectedTopic} ${candidate.contentAngle} ${candidate.selectionRationale}`); }
function meaningful(value: string): string[] { const ignored = new Set(["관리", "방법", "가이드", "정보", "콘텐츠", "글", "프로젝트", "위한", "대한"]); return [...new Set(normalize(value).split(" ").filter((term) => term.length >= 2 && !ignored.has(term)))]; }
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣\s]/g, " ").replace(/\s+/g, " ").trim(); }
function overlap(left: readonly string[], right: readonly string[]): boolean { return left.some((a) => right.some((b) => a.includes(b) || b.includes(a))); }
function averageVerifiedEvidenceConfidence(values: readonly OpportunityEvidenceRecord[]): number | undefined {
  const eligible = values.filter((value) => value.verified && value.freshness !== "unavailable");
  if (!eligible.length) return undefined;
  return eligible.reduce((sum, value) => sum + value.confidence, 0) / eligible.length;
}
function projectExcluded(candidate: ContentOpportunityCandidate, project: UserProject): boolean {
  const excluded = (project.strategy?.excludedTopics ?? []).flatMap(meaningful);
  if (!excluded.length) return false;
  return overlap(meaningful(`${candidate.selectedTopic} ${candidate.primaryKeyword} ${candidate.contentAngle}`), excluded);
}
function verifiedCount(value: ContentOpportunityCandidate): number { return value.opportunityEvidence.filter((item) => item.verified).length; }
function freshnessPriority(value: ContentOpportunityCandidate["freshness"]): number { return value === "fresh" ? 0 : value === "aging" ? 1 : value === "stale" ? 2 : 3; }
