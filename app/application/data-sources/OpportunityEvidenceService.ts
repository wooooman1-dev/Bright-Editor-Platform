import {
  assessOpportunityRecommendation,
  calculateFreshness,
  createOpportunityEvidence,
  recommendationTypePriority,
  type DataSourceConnectionRepository,
  type OpportunityEvidenceRecord,
  type OpportunityEvidenceRepository,
  type ProjectDataSourceReferenceRepository,
} from "../../../core/intelligence";
import { createContentOpportunityCandidate, type ContentOpportunityCandidate, type OpportunityEvidence } from "../../../core/content";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";

export class OpportunityEvidenceService {
  constructor(
    private readonly connections: DataSourceConnectionRepository,
    private readonly references: ProjectDataSourceReferenceRepository,
    private readonly repository: OpportunityEvidenceRepository,
  ) {}

  async buildPlanningBundle(data: UserData, project: UserProject, currentContentId?: string): Promise<readonly OpportunityEvidenceRecord[]> {
    if (data.workspace?.id !== project.workspaceId) throw new Error("Project does not belong to the current Workspace.");
    const references = (await this.references.listByProject(project.id)).filter((value) => value.workspaceId === project.workspaceId && value.enabled);
    const allowedIds = new Set(references.map((value) => value.connectionId));
    const connections = (await this.connections.listByWorkspace(project.workspaceId)).filter((value) => allowedIds.has(value.id) && value.enabled && value.status !== "disconnected");
    const allowedConnectionIds = new Set(connections.map((value) => value.id));
    const external = (await this.repository.listByWorkspace(project.workspaceId))
      .filter((value) => value.projectId == null && Boolean(value.connectionId && allowedConnectionIds.has(value.connectionId)))
      .filter((value) => Boolean(value.keyword || value.topic || value.pageUrl))
      .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))
      .slice(0, 100)
      .map((value) => value.provider === "brightStudio" ? value : Object.freeze({ ...value, freshness: calculateFreshness(value.provider, value.syncedAt) }));
    const internal = buildInternalGrowthEvidence(data, project, currentContentId);
    await this.repository.saveMany(internal);
    return Object.freeze([...external, ...internal]);
  }

  classifyCandidates(candidates: readonly ContentOpportunityCandidate[], bundle: readonly OpportunityEvidenceRecord[], data: UserData, project: UserProject): readonly ContentOpportunityCandidate[] {
    const published = publicContents(data, project.id);
    const classified = candidates.flatMap((candidate) => {
      const matched = matchEvidence(candidate, bundle, project);
      const duplicate = published.some((content) => isDirectDuplicate(candidate, content));
      const aligned = projectAligned(candidate, project);
      const searchIntentClear = candidate.searchIntent.trim().length >= 4;
      const safe = safetyPassed(candidate);
      const assessment = assessOpportunityRecommendation({
        evidence: matched,
        duplicate,
        projectAligned: aligned,
        searchIntentClear,
        safetyPassed: safe,
      });
      const userSpecifiedFallback = candidate.selectionMode === "userSpecified" && searchIntentClear && safe;
      const recommendationType = assessment.recommendationType ?? (userSpecifiedFallback ? "blogGrowth" as const : undefined);
      if (!recommendationType) return [];
      const evidenceConfidence = averageVerifiedEvidenceConfidence(matched);
      const summaries = matched.map(toOpportunityEvidence);
      const limitations = [...assessment.limitations];
      if (userSpecifiedFallback && !matched.length) limitations.push("사용자가 직접 지정한 주제이므로 외부 시장 Evidence 없이 계속 진행합니다. 검색 수요와 성과 가능성은 검증되지 않았습니다.");
      if (userSpecifiedFallback && duplicate) limitations.push("현재 Project에 유사한 공개 콘텐츠가 있을 수 있습니다. 중복 여부를 확인해 주세요.");
      if (userSpecifiedFallback && !aligned) limitations.push("현재 Project 전략과의 연관성이 자동으로 확인되지 않았습니다. 사용자가 지정한 주제를 우선하여 계속 진행합니다.");
      return [createContentOpportunityCandidate({
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
      })];
    });
    return Object.freeze(classified.sort((left, right) => recommendationTypePriority(left.recommendationType) - recommendationTypePriority(right.recommendationType)
      || verifiedCount(right) - verifiedCount(left)
      || freshnessPriority(left.freshness) - freshnessPriority(right.freshness)
      || left.opportunityId.localeCompare(right.opportunityId)));
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
function verifiedCount(value: ContentOpportunityCandidate): number { return value.opportunityEvidence.filter((item) => item.verified).length; }
function freshnessPriority(value: ContentOpportunityCandidate["freshness"]): number { return value === "fresh" ? 0 : value === "aging" ? 1 : value === "stale" ? 2 : 3; }
