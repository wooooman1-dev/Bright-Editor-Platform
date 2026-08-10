import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  hasCurrentContentOpportunityFingerprint,
  serializeStructuredList,
  type ConfirmedContentOpportunity,
  type ContentDocument,
  type ContentOpportunityCandidate,
  type ContentOpportunitySelectionMode,
  type ContentPlanQualityTarget,
  type LongFormDiagnostic,
} from "../../core/content";
import type { QualityReport } from "../../core/quality";
import type { ApprovalSourcePreflightDiagnostic } from "../../core/approval";
import type { AIResponse } from "../../core/ai";

export type ThemePreference = "system" | "light" | "dark";
export const supportedWorkspacePlatforms = ["tistory", "wordpress", "youtube", "naver_cafe"] as const;
export type WorkspacePlatform = (typeof supportedWorkspacePlatforms)[number];
export type WorkspacePublishingPolicy = Readonly<{
  reviewFirst: true;
  draftOnly: true;
  publicPublish: false;
  sequentialDraftSave: boolean;
  qualityApprovalRequired: true;
  /**
   * Enables `future` WordPress scheduling, which releases a post publicly at the
   * scheduled time. Absent or false means only `draft` scheduling is allowed.
   * Immediate public publishing stays disabled either way. See D-038.
   */
  wordpressSchedulePublicPublish?: boolean;
}>;
export type WorkspaceSettings = Readonly<{
  enabledPlatforms: readonly WorkspacePlatform[];
  publishing: WorkspacePublishingPolicy;
  appearance: Readonly<{ theme: ThemePreference }>;
}>;
export type UserWorkspace = Readonly<{
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  settings?: WorkspaceSettings;
}>;
export type UserBrand = Readonly<{ id: string; workspaceId: string; name: string }>;

export type WordPressDefaultCategory = Readonly<{
  publishingAccountId: string;
  id: string;
  name: string;
}>;

export type WordPressPublishingPreparation = Readonly<{
  publishingAccountId: string;
  categoryIds: readonly string[];
  categoryNames: readonly string[];
  featuredImageAssetId?: string;
  updatedAt: string;
}>;

export type UserProject = Readonly<{
  id: string;
  workspaceId: string;
  brandId?: string;
  name: string;
  description: string;
  selectedPublishingAccountIds?: readonly string[];
  strategy?: ProjectContentStrategy;
  createdAt: string;
  updatedAt: string;
}>;
export type ProjectContentStrategy = Readonly<{
  primaryTopic: string; subtopics: readonly string[]; excludedTopics: readonly string[];
  defaultContentType: string; defaultPlatform: string; targetAudience: string; tone: string;
  /** Legacy Project strategy field. Read for compatibility but not used by Planning or Quality. */
  targetLength?: string;
  internalLinkPolicy: string; relatedPostPolicy: string; ctaPolicy: string; imageStrategy: string; seoPolicy: string;
  defaultPublishingAccountId?: string;
  defaultTistoryCategory?: Readonly<{ publishingAccountId: string; id: string | null; name: string | null }>;
  defaultWordPressCategories?: readonly WordPressDefaultCategory[];
}>;

export type ContentPlanningResult = Readonly<{
  interpretedIntent: string;
  domain: string;
  targetAudience: string;
  contentGoal: string;
  recommendedPrimaryKeyword: string;
  keywordCandidates: readonly string[];
  searchIntent: string;
  providerSearchIntent?: string;
  recommendedContentType: string;
  recommendedPlatforms: readonly string[];
  suggestedTitleAngles: readonly string[];
  relatedKeywords: readonly string[];
  contentCluster: readonly string[];
  recommendationReason: string;
  confidence: number;
  estimateDisclosure: string;
  selectionMode?: ContentOpportunitySelectionMode;
  opportunityCandidates?: readonly ContentOpportunityCandidate[];
  qualityTarget?: ContentPlanQualityTarget;
}>;

export type ContentPlanningWorkflowStatus =
  | "requested"
  | "planning"
  | "candidatesReady"
  | "opportunitySelected"
  | "opportunityConfirmed"
  | "generating"
  | "generated"
  | "failed"
  | "cancelled";

export type ContentPlanningWorkflowStep = "request" | "planning" | "selection" | "confirmation" | "generation" | "review";

export type ContentPlanningWorkflow = Readonly<{
  status: ContentPlanningWorkflowStatus;
  request: string;
  selectionMode: ContentOpportunitySelectionMode;
  operationId: string;
  selectedOpportunityId?: string;
  error?: string;
  retryFrom?: ContentPlanningWorkflowStep;
  failedStep?: ContentPlanningWorkflowStep;
  lastSuccessfulStep?: ContentPlanningWorkflowStep;
  revision: number;
  createdAt: string;
  updatedAt: string;
  longFormDiagnostic?: LongFormDiagnostic;
  approvalSourcePreflightDiagnostic?: ApprovalSourcePreflightDiagnostic;
  aiProviderDiagnostic?: AIResponse["diagnostics"];
}>;

export type UserContentStatus = "planning" | "configuration_required" | "draft" | "in_review" | "ready" | "draft_saved";

export type UserContent = Readonly<{
  id: string;
  workspaceId?: string;
  projectId: string;
  brandId?: string;
  naturalLanguageRequest?: string;
  /** AI suggestions and analysis. This is not confirmation; primaryKeyword is canonical. */
  planning?: ContentPlanningResult;
  /** Durable, Content-bound state for resuming planning and generation after navigation or reload. */
  planningWorkflow?: ContentPlanningWorkflow;
  /** Atomic user-confirmed strategy snapshot used by every AI document mutation. */
  opportunity?: ConfirmedContentOpportunity;
  interpretedIntent?: string;
  domain?: string;
  primaryKeyword?: string;
  relatedKeywords?: readonly string[];
  searchIntent?: string;
  providerSearchIntent?: string;
  targetAudience?: string;
  contentGoal?: string;
  contentType?: string;
  selectedPublishingAccountIds?: readonly string[];
  publishingAccountId?: string;
  title: string;
  body: string;
  status: UserContentStatus;
  creationMethod?: "natural_language" | "manual";
  createdAt?: string;
  updatedAt: string;
  document?: ContentDocument;
  quality?: QualityReport;
  platform?: string;
  publishedUrl?: string;
  generationError?: string;
  reviewError?: string;
  generationDiagnostic?: LongFormDiagnostic;
  reviewDiagnostic?: LongFormDiagnostic;
  qualityTarget?: ContentPlanQualityTarget;
  finalConfirmationAt?: string;
  publishingPreparation?: Readonly<{
    tistory?: Readonly<{
      publishingAccountId: string;
      platformCategoryId: string | null;
      platformCategoryName: string | null;
      updatedAt: string;
    }>;
    wordpress?: WordPressPublishingPreparation;
  }>;
}>;

export type UserHistoryEntry = Readonly<{
  id: string;
  contentId: string;
  document: ContentDocument;
  reason: "autosave" | "manual" | "generation" | "ai_revision";
  recordedAt: string;
  version: number;
}>;

export type UserPublishingRecord = import("../../core/publishing").PublishingRecord;

export type UserData = Readonly<{
  workspace?: UserWorkspace;
  brands: readonly UserBrand[];
  projects: readonly UserProject[];
  contents: readonly UserContent[];
  history?: readonly UserHistoryEntry[];
  mediaMetadata?: readonly import("../../core/media").MediaAsset[];
  qualityReports?: readonly Readonly<{ contentId: string; report: QualityReport }> [];
  publishingRecords?: readonly UserPublishingRecord[];
  scheduledPublishing?: readonly Readonly<{ contentId: string; platform: string; scheduledFor: string }> [];
}>;

export const userDataStorageKey = "bright-studio-user-data-v1";
export const emptyUserData: UserData = Object.freeze({
  brands: [], projects: [], contents: [], history: [], mediaMetadata: [],
  qualityReports: [], publishingRecords: [], scheduledPublishing: [],
});

export function hasConfiguredEnabledPlatforms(data: UserData): boolean {
  return Array.isArray(data.workspace?.settings?.enabledPlatforms);
}

export function normalizeRequiredName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function createWorkspace(data: UserData, name: string, id: string): UserData {
  const normalizedName = normalizeRequiredName(name);
  if (!normalizedName) throw new Error("작업 공간 이름을 입력해 주세요.");
  const now = new Date().toISOString();
  return { ...data, workspace: { id, name: normalizedName, createdAt: now, updatedAt: now } };
}

export function createProject(
  data: UserData,
  input: Readonly<{ id: string; name: string; brandName?: string; description?: string; brandIdFactory: () => string; now: string }>,
): UserData {
  if (!data.workspace) throw new Error("먼저 작업 공간을 만들어 주세요.");
  const name = normalizeRequiredName(input.name);
  if (!name) throw new Error("프로젝트 이름을 입력해 주세요.");
  const brandName = normalizeRequiredName(input.brandName ?? "");
  const brands = [...data.brands];
  let brandId: string | undefined;
  if (brandName) {
    const existing = brands.find((brand) => brand.workspaceId === data.workspace!.id && brand.name.localeCompare(brandName, "ko", { sensitivity: "accent" }) === 0);
    if (existing) brandId = existing.id;
    else { brandId = input.brandIdFactory(); brands.push({ id: brandId, workspaceId: data.workspace.id, name: brandName }); }
  }
  const project: UserProject = {
    id: input.id, workspaceId: data.workspace.id, ...(brandId ? { brandId } : {}), name,
    description: normalizeRequiredName(input.description ?? ""), selectedPublishingAccountIds: [],
    strategy: defaultProjectStrategy(name, input.description ?? ""), createdAt: input.now, updatedAt: input.now,
  };
  return { ...data, brands, projects: [...data.projects, project] };
}

/** Legacy/manual creation entry kept for existing callers. */
export function createContent(data: UserData, input: Readonly<{ id: string; projectId: string; title: string; now: string }>): UserData {
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const title = normalizeRequiredName(input.title);
  if (!title) throw new Error("콘텐츠 제목을 입력해 주세요.");
  const content: UserContent = {
    id: input.id, workspaceId: project.workspaceId, projectId: project.id, ...(project.brandId ? { brandId: project.brandId } : {}),
    title, body: "", status: "draft", creationMethod: "manual", createdAt: input.now, updatedAt: input.now,
    selectedPublishingAccountIds: project.selectedPublishingAccountIds ?? [],
  };
  return { ...data, contents: [...data.contents, content] };
}

export function startContentPlanning(data: UserData, input: Readonly<{
  id: string;
  projectId: string;
  request: string;
  selectionMode: ContentOpportunitySelectionMode;
  operationId: string;
  now: string;
}>): UserData {
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const request = input.request.trim();
  const operationId = normalizeRequiredName(input.operationId);
  if (!request || !operationId) throw new Error("Planning 요청과 operation ID를 확인해 주세요.");
  const existing = data.contents.find((content) => content.id === input.id);
  if (existing && (existing.workspaceId !== project.workspaceId || existing.projectId !== project.id)) {
    throw new Error("Planning Content가 현재 Workspace 또는 Project와 일치하지 않습니다.");
  }
  if (existing?.document) {
    throw new Error("원고가 생성된 Content는 새 Planning 요청으로 덮어쓸 수 없습니다.");
  }
  const priorRevision = existing?.planningWorkflow?.revision ?? 0;
  const workflow: ContentPlanningWorkflow = Object.freeze({
    status: "planning",
    request,
    selectionMode: input.selectionMode,
    operationId,
    revision: priorRevision + 1,
    createdAt: existing?.planningWorkflow?.createdAt ?? input.now,
    updatedAt: input.now,
    ...(existing?.planning ? { lastSuccessfulStep: "planning" as const } : { lastSuccessfulStep: "request" as const }),
  });
  const content: UserContent = Object.freeze({
    ...(existing ?? {}),
    id: input.id,
    workspaceId: project.workspaceId,
    projectId: project.id,
    ...(project.brandId ? { brandId: project.brandId } : {}),
    naturalLanguageRequest: request,
    planningWorkflow: workflow,
    opportunity: undefined,
    primaryKeyword: undefined,
    relatedKeywords: undefined,
    searchIntent: undefined,
    targetAudience: undefined,
      contentGoal: undefined,
      contentType: undefined,
      qualityTarget: undefined,
    quality: undefined,
    generationError: undefined,
    title: existing?.planning?.opportunityCandidates?.[0]?.selectedTopic ?? request.slice(0, 80),
    body: existing?.body ?? "",
    status: "planning",
    creationMethod: "natural_language",
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    selectedPublishingAccountIds: existing?.selectedPublishingAccountIds ?? project.selectedPublishingAccountIds ?? [],
  });
  return {
    ...data,
    contents: existing
      ? data.contents.map((item) => item.id === existing.id ? content : item)
      : [...data.contents, content],
  };
}

export function completeContentPlanning(data: UserData, input: Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  operationId: string;
  plan: ContentPlanningResult;
  now: string;
}>): UserData {
  return updatePlanningContent(data, input, (content, workflow) => {
    const candidates = input.plan.opportunityCandidates ?? [];
    if (!candidates.length || candidates.some((candidate) => candidate.projectId !== input.projectId || !hasCurrentContentOpportunityFingerprint(candidate))) {
      throw new Error("Planning 후보의 Project binding 또는 fingerprint가 유효하지 않습니다.");
    }
    const selectedOpportunityId = candidates[0].opportunityId;
    return {
      ...content,
      naturalLanguageRequest: workflow.request,
      planning: input.plan,
      interpretedIntent: input.plan.interpretedIntent,
      domain: input.plan.domain,
      title: candidates[0].selectedTopic,
      planningWorkflow: nextPlanningWorkflow(workflow, input.now, {
        status: "candidatesReady",
        selectedOpportunityId,
        lastSuccessfulStep: "planning",
      }),
      updatedAt: input.now,
    };
  });
}

export function selectContentPlanningOpportunity(data: UserData, input: Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  opportunityId: string;
  expectedRevision: number;
  now: string;
}>): UserData {
  const content = requirePlanningContent(data, input.workspaceId, input.projectId, input.contentId);
  const workflow = requirePlanningWorkflow(content);
  if (workflow.revision !== input.expectedRevision) throw new Error("Planning 상태가 다른 화면에서 변경되었습니다. 최신 상태를 다시 불러와 주세요.");
  const candidate = content.planning?.opportunityCandidates?.find((item) => item.opportunityId === input.opportunityId);
  if (!candidate || candidate.projectId !== input.projectId || !hasCurrentContentOpportunityFingerprint(candidate)) {
    throw new Error("선택한 Content Opportunity가 현재 Planning 후보와 일치하지 않습니다.");
  }
  return updateContent(data, content.id, {
    title: candidate.selectedTopic,
    planningWorkflow: nextPlanningWorkflow(workflow, input.now, {
      status: "opportunitySelected",
      selectedOpportunityId: candidate.opportunityId,
      lastSuccessfulStep: "selection",
    }),
    updatedAt: input.now,
  });
}

export function failContentPlanning(data: UserData, input: Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  operationId: string;
  error: string;
  retryFrom: "planning" | "generation" | "review";
  diagnostic?: LongFormDiagnostic;
  approvalSourcePreflightDiagnostic?: ApprovalSourcePreflightDiagnostic;
  aiProviderDiagnostic?: AIResponse["diagnostics"];
  now: string;
}>): UserData {
  try {
    return updatePlanningContent(data, input, (content, workflow) => {
      const normalizedError = normalizeRequiredName(input.error) || "작업에 실패했습니다.";
      if (workflow.status === "failed" && workflow.error === normalizedError && workflow.retryFrom === input.retryFrom) return content;
      return {
        ...content,
        planningWorkflow: nextPlanningWorkflow(workflow, input.now, {
          status: "failed",
          error: normalizedError,
          retryFrom: input.retryFrom,
          failedStep: input.retryFrom,
          ...(input.diagnostic ? { longFormDiagnostic: input.diagnostic } : {}),
          ...(input.approvalSourcePreflightDiagnostic
            ? { approvalSourcePreflightDiagnostic: input.approvalSourcePreflightDiagnostic }
            : {}),
          ...(input.aiProviderDiagnostic
            ? { aiProviderDiagnostic: input.aiProviderDiagnostic }
            : {}),
        }),
        generationError: input.retryFrom === "generation" ? input.error : content.generationError,
        reviewError: input.retryFrom === "review" ? input.error : content.reviewError,
        generationDiagnostic: input.retryFrom === "generation" ? input.diagnostic : content.generationDiagnostic,
        updatedAt: input.now,
      };
    });
  } catch (error) {
    if (error instanceof StalePlanningOperationError) return data;
    throw error;
  }
}

export function startContentGeneration(data: UserData, input: Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  operationId: string;
  now: string;
}>): UserData {
  const content = requirePlanningContent(data, input.workspaceId, input.projectId, input.contentId);
  const workflow = requirePlanningWorkflow(content);
  if (!content.opportunity || workflow.status !== "opportunityConfirmed") throw new Error("Content Opportunity를 먼저 확정해 주세요.");
  return updateContent(data, content.id, {
    planningWorkflow: nextPlanningWorkflow(workflow, input.now, {
      status: "generating",
      operationId: input.operationId,
      lastSuccessfulStep: "confirmation",
    }),
    generationError: undefined,
    reviewError: undefined,
    generationDiagnostic: undefined,
    updatedAt: input.now,
  });
}

export function completeContentGeneration(data: UserData, input: Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  operationId: string;
  now: string;
}>): UserData {
  return updatePlanningContent(data, input, (content, workflow) => ({
    ...content,
    planningWorkflow: nextPlanningWorkflow(workflow, input.now, {
      status: "generated",
      lastSuccessfulStep: "generation",
    }),
    updatedAt: input.now,
  }));
}

export function createContentFromPlan(data: UserData, input: Readonly<{
  id: string; projectId: string; naturalLanguageRequest: string; plan: ContentPlanningResult;
  opportunity?: ContentOpportunityCandidate; primaryKeyword?: string; selectedPublishingAccountIds: readonly string[]; now: string;
}>): UserData {
  const existing = data.contents.find((content) => content.id === input.id);
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const request = normalizeRequiredName(input.naturalLanguageRequest);
  const selectedOpportunity = input.opportunity ?? resolveLegacyOpportunity(input.plan, input.primaryKeyword, input.projectId, request);
  const opportunity = confirmContentOpportunity(selectedOpportunity, {
    workspaceId: project.workspaceId,
    projectId: project.id,
    contentId: input.id,
    confirmedAt: input.now,
  });
  if (!request) throw new Error("요청과 콘텐츠 기회를 확인해 주세요.");
  const content: UserContent = {
    ...(existing ?? {}),
    id: input.id, workspaceId: project.workspaceId, projectId: project.id, ...(project.brandId ? { brandId: project.brandId } : {}),
    naturalLanguageRequest: request, interpretedIntent: input.plan.interpretedIntent, domain: input.plan.domain,
    planning: input.plan, opportunity,
    planningWorkflow: existing?.planningWorkflow
      ? nextPlanningWorkflow(existing.planningWorkflow, input.now, {
        status: "opportunityConfirmed",
        selectedOpportunityId: opportunity.opportunityId,
        lastSuccessfulStep: "confirmation",
      })
      : undefined,
    primaryKeyword: opportunity.primaryKeyword, relatedKeywords: opportunity.secondaryKeywords, searchIntent: opportunity.searchIntent,
    providerSearchIntent: opportunity.providerSearchIntent,
    targetAudience: opportunity.audience, contentGoal: opportunity.contentAngle, contentType: opportunity.contentType,
    qualityTarget: opportunity.qualityTarget,
    selectedPublishingAccountIds: [...new Set(input.selectedPublishingAccountIds)],
    ...(input.selectedPublishingAccountIds.length === 1 ? { publishingAccountId: input.selectedPublishingAccountIds[0], platform: resolveProjectStrategy(project).defaultPlatform } : {}),
    title: opportunity.selectedTopic,
    body: existing?.body ?? "", status: "planning", creationMethod: "natural_language", createdAt: existing?.createdAt ?? input.now, updatedAt: input.now,
  };
  return { ...data, contents: existing ? data.contents.map((item) => item.id === existing.id ? content : item) : [...data.contents, content] };
}

function updatePlanningContent(
  data: UserData,
  input: Readonly<{ workspaceId: string; projectId: string; contentId: string; operationId: string; now: string }>,
  update: (content: UserContent, workflow: ContentPlanningWorkflow) => UserContent,
): UserData {
  const content = requirePlanningContent(data, input.workspaceId, input.projectId, input.contentId);
  const workflow = requirePlanningWorkflow(content);
  if (workflow.operationId !== input.operationId) throw new StalePlanningOperationError();
  return updateContent(data, content.id, update(content, workflow));
}

function requirePlanningContent(data: UserData, workspaceId: string, projectId: string, contentId: string): UserContent {
  if (data.workspace?.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  if (!project) throw new Error("Project가 현재 Workspace에 속하지 않습니다.");
  const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId && item.projectId === projectId);
  if (!content) throw new Error("Planning Content가 현재 Project에 속하지 않습니다.");
  return content;
}

function requirePlanningWorkflow(content: UserContent): ContentPlanningWorkflow {
  if (!content.planningWorkflow) throw new Error("복원 가능한 Planning 상태가 없습니다.");
  return content.planningWorkflow;
}

function nextPlanningWorkflow(
  workflow: ContentPlanningWorkflow,
  updatedAt: string,
  update: Partial<ContentPlanningWorkflow>,
): ContentPlanningWorkflow {
  const next = { ...workflow, ...update, revision: workflow.revision + 1, updatedAt };
  if (update.status !== "failed") {
    delete next.error;
    delete next.retryFrom;
    delete next.failedStep;
  }
  return Object.freeze(next);
}

export class StalePlanningOperationError extends Error {
  constructor() { super("이전 Planning 요청의 응답이라 현재 Content에 적용하지 않았습니다."); }
}

function resolveLegacyOpportunity(
  plan: ContentPlanningResult,
  requestedKeyword: string | undefined,
  projectId: string,
  sourceRequest: string,
): ContentOpportunityCandidate {
  const keyword = normalizeRequiredName(requestedKeyword ?? plan.recommendedPrimaryKeyword);
  const candidate = plan.opportunityCandidates?.find((item) => normalizeRequiredName(item.primaryKeyword).toLocaleLowerCase("ko-KR") === keyword.toLocaleLowerCase("ko-KR"));
  if (candidate) return candidate;
  if (keyword.toLocaleLowerCase("ko-KR") !== normalizeRequiredName(plan.recommendedPrimaryKeyword).toLocaleLowerCase("ko-KR")) {
    throw new Error("대표 키워드만 변경할 수 없습니다. 주제와 검색 의도가 포함된 콘텐츠 기회를 다시 선택해 주세요.");
  }
  return createContentOpportunityCandidate({
    sourceRequest,
    selectionMode: plan.selectionMode ?? "userSpecified",
    selectedTopic: plan.suggestedTitleAngles[0] ?? keyword,
    primaryKeyword: keyword,
    secondaryKeywords: plan.relatedKeywords,
    searchIntent: plan.searchIntent,
    audience: plan.targetAudience,
    contentType: plan.recommendedContentType,
    contentAngle: plan.contentGoal,
    readerProblem: plan.interpretedIntent,
    expectedCoverage: plan.contentCluster,
    selectionRationale: plan.recommendationReason,
    opportunityEvidence: [{ source: plan.confidence > 0 ? "estimated" : "unknown", summary: plan.estimateDisclosure }],
    confidence: plan.confidence,
    cautions: [plan.estimateDisclosure],
    projectId,
  });
}

export function updateProjectStrategy(data: UserData, projectId: string, strategy: ProjectContentStrategy, now: string): UserData {
  return { ...data, projects: data.projects.map((project) => project.id === projectId ? { ...project, strategy, updatedAt: now } : project) };
}
export function renameProject(data: UserData, projectId: string, name: string, now: string): UserData {
  const normalized = normalizeRequiredName(name);
  if (!normalized) throw new Error("프로젝트 이름을 입력해 주세요.");
  let found = false;
  const projects = data.projects.map((project) => {
    if (project.id !== projectId) return project;
    found = true;
    return { ...project, name: normalized, updatedAt: now };
  });
  if (!found) throw new Error("프로젝트를 찾을 수 없습니다.");
  return { ...data, projects };
}
export function resolveProjectStrategy(project: UserProject): ProjectContentStrategy { return project.strategy ?? defaultProjectStrategy(project.name, project.description); }
export function buildAutomaticContentPlanningRequest(strategy: ProjectContentStrategy): string {
  const contentScope = strategy.subtopics
    .map(normalizeRequiredName)
    .filter(Boolean)
    .join(", ") || normalizeRequiredName(strategy.primaryTopic) || "설정된 주제 없음";
  const excludedTopics = strategy.excludedTopics
    .map(normalizeRequiredName)
    .filter(Boolean)
    .join(", ") || "없음";
  return `현재 Project에서 아직 다루지 않은 주제를 선정해 ${normalizeRequiredName(strategy.targetAudience)}을 위한 ${normalizeRequiredName(strategy.defaultContentType)} 원고를 작성해줘. 콘텐츠 범위: ${contentScope}. 제외 주제: ${excludedTopics}.`;
}
function defaultProjectStrategy(name: string, description: string): ProjectContentStrategy { return { primaryTopic: name, subtopics: description ? [description] : [], excludedTopics: [], defaultContentType: "Google SEO 정보 콘텐츠", defaultPlatform: "tistory", targetAudience: "주제에 관심 있는 일반 독자", tone: "친절하고 신뢰할 수 있는 설명", internalLinkPolicy: "본문 중간 실제 공개 글 1개 자동 배치", relatedPostPolicy: "문서 마지막 실제 공개 글 최대 3개 자동 배치", ctaPolicy: "필요한 경우 최대 1~2개", imageStrategy: "주요 섹션에 설명적인 ALT가 있는 이미지 placeholder", seoPolicy: "Helpful · Reliable · People-first" }; }

export function updateProjectTargets(data: UserData, projectId: string, accountIds: readonly string[], now: string): UserData {
  return { ...data, projects: data.projects.map((project) => project.id === projectId ? { ...project, selectedPublishingAccountIds: [...new Set(accountIds)], updatedAt: now } : project) };
}

export function updateContent(data: UserData, contentId: string, update: Partial<UserContent>): UserData {
  let found = false;
  const contents = data.contents.map((content) => { if (content.id !== contentId) return content; found = true; return { ...content, ...update, id: content.id, projectId: content.projectId }; });
  if (!found) throw new Error("콘텐츠를 찾을 수 없습니다.");
  return { ...data, contents };
}

export function applyCanonicalDocument(data: UserData, contentId: string, document: ContentDocument, reason: UserHistoryEntry["reason"], at: string): UserData {
  const content = data.contents.find((item) => item.id === contentId);
  if (!content) throw new Error("콘텐츠를 찾을 수 없습니다.");
  const prior = (data.history ?? []).filter((entry) => entry.contentId === contentId);
  const body = documentToEditableText(document);
  return {
    ...updateContent(data, contentId, { document, title: document.title, body, quality: undefined, status: "draft", updatedAt: at, generationError: undefined }),
    history: [...(data.history ?? []), { id: `${contentId}:${prior.length + 1}`, contentId, document, reason, recordedAt: at, version: prior.length + 1 }],
  };
}

export function saveDraft(data: UserData, input: Readonly<{ contentId: string; title: string; body: string; now: string; reason?: UserHistoryEntry["reason"] }>): UserData {
  const title = normalizeRequiredName(input.title);
  if (!title) throw new Error("콘텐츠 제목을 입력해 주세요.");
  const content = data.contents.find((item) => item.id === input.contentId);
  if (!content) throw new Error("콘텐츠를 찾을 수 없습니다.");
  const document = bodyToDocument(content, title, input.body);
  const unchanged = content.title === title && content.body === input.body;
  if (unchanged) return data;
  const prior = (data.history ?? []).filter((entry) => entry.contentId === content.id);
  const historyEntry: UserHistoryEntry = {
    id: `${content.id}:${prior.length + 1}`, contentId: content.id, document,
    reason: input.reason ?? "autosave", recordedAt: input.now, version: prior.length + 1,
  };
  return {
    ...data,
    contents: data.contents.map((item) => item.id === content.id ? { ...item, title, body: input.body, document, quality: undefined, status: "draft", updatedAt: input.now } : item),
    history: [...(data.history ?? []), historyEntry],
  };
}

export function parseStoredUserData(raw: string | null): UserData {
  if (!raw) return emptyUserData;
  try {
    const parsed = JSON.parse(raw) as Partial<UserData>;
    return {
      workspace: parsed.workspace,
      brands: Array.isArray(parsed.brands) ? parsed.brands : [], projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      contents: Array.isArray(parsed.contents) ? parsed.contents : [], history: Array.isArray(parsed.history) ? parsed.history : [],
      mediaMetadata: Array.isArray(parsed.mediaMetadata) ? parsed.mediaMetadata : [], qualityReports: Array.isArray(parsed.qualityReports) ? parsed.qualityReports : [],
      publishingRecords: Array.isArray(parsed.publishingRecords) ? parsed.publishingRecords : [], scheduledPublishing: Array.isArray(parsed.scheduledPublishing) ? parsed.scheduledPublishing : [],
    };
  } catch { return emptyUserData; }
}

function bodyToDocument(content: UserContent, title: string, body: string): ContentDocument {
  const editable = editableTextToBlocks(content.id, body);
  const nonTextBlocks = content.document?.blocks.filter((block) => block.type !== "heading" && block.type !== "paragraph" && block.type !== "list") ?? [];
  return Object.freeze({ id: content.document?.id ?? content.id, title, blocks: Object.freeze([...editable, ...nonTextBlocks]) });
}

export function documentToEditableText(document: ContentDocument): string {
  return document.blocks.flatMap((block) => {
    if (block.type === "heading") return [`${"#".repeat(block.level)} ${block.text}`];
    if (block.type === "paragraph") return [block.text];
    if (block.type === "list") return [serializeStructuredList(block)];
    return [];
  }).join("\n\n");
}

function editableTextToBlocks(contentId: string, body: string): ContentDocument["blocks"] {
  return body.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean).map((text, index) => {
    const heading = text.match(/^(#{1,6})\s+([\s\S]+)$/);
    if (heading) return { id: `${contentId}-heading-${index + 1}`, level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, text: heading[2].trim(), type: "heading" as const };
    return { id: `${contentId}-paragraph-${index + 1}`, text, type: "paragraph" as const };
  });
}
