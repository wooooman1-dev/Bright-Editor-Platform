import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";

export type ThemePreference = "system" | "light" | "dark";
export const supportedWorkspacePlatforms = ["tistory", "wordpress", "youtube", "naver_cafe"] as const;
export type WorkspacePlatform = (typeof supportedWorkspacePlatforms)[number];
export type WorkspacePublishingPolicy = Readonly<{
  reviewFirst: true;
  draftOnly: true;
  publicPublish: false;
  sequentialDraftSave: boolean;
  qualityApprovalRequired: true;
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
  defaultContentType: string; defaultPlatform: string; targetLength: string; targetAudience: string; tone: string;
  internalLinkPolicy: string; relatedPostPolicy: string; ctaPolicy: string; imageStrategy: string; seoPolicy: string;
  defaultPublishingAccountId?: string;
  defaultTistoryCategory?: Readonly<{ publishingAccountId: string; id: string | null; name: string | null }>;
}>;

export type ContentPlanningResult = Readonly<{
  interpretedIntent: string;
  domain: string;
  targetAudience: string;
  contentGoal: string;
  recommendedPrimaryKeyword: string;
  keywordCandidates: readonly string[];
  searchIntent: string;
  recommendedContentType: string;
  recommendedPlatforms: readonly string[];
  suggestedTitleAngles: readonly string[];
  relatedKeywords: readonly string[];
  contentCluster: readonly string[];
  recommendationReason: string;
  confidence: number;
  estimateDisclosure: string;
}>;

export type UserContentStatus = "planning" | "configuration_required" | "draft" | "in_review" | "ready" | "draft_saved";

export type UserContent = Readonly<{
  id: string;
  workspaceId?: string;
  projectId: string;
  brandId?: string;
  naturalLanguageRequest?: string;
  interpretedIntent?: string;
  domain?: string;
  primaryKeyword?: string;
  relatedKeywords?: readonly string[];
  searchIntent?: string;
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
  finalConfirmationAt?: string;
  publishingPreparation?: Readonly<{
    tistory?: Readonly<{
      publishingAccountId: string;
      platformCategoryId: string | null;
      platformCategoryName: string | null;
      updatedAt: string;
    }>;
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

export type UserPublishingRecord = Readonly<{
  id: string;
  contentId: string;
  platformConnectionId: string;
  status: "saved" | "partially_verified" | "failed";
  createdAt: string;
}>;

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

export function createContentFromPlan(data: UserData, input: Readonly<{
  id: string; projectId: string; naturalLanguageRequest: string; plan: ContentPlanningResult;
  primaryKeyword: string; selectedPublishingAccountIds: readonly string[]; now: string;
}>): UserData {
  const existing = data.contents.find((content) => content.id === input.id);
  if (existing) return data;
  const project = data.projects.find((item) => item.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const request = normalizeRequiredName(input.naturalLanguageRequest);
  const keyword = normalizeRequiredName(input.primaryKeyword);
  if (!request || !keyword) throw new Error("요청과 대표 키워드를 확인해 주세요.");
  const content: UserContent = {
    id: input.id, workspaceId: project.workspaceId, projectId: project.id, ...(project.brandId ? { brandId: project.brandId } : {}),
    naturalLanguageRequest: request, interpretedIntent: input.plan.interpretedIntent, domain: input.plan.domain,
    primaryKeyword: keyword, relatedKeywords: input.plan.relatedKeywords, searchIntent: input.plan.searchIntent,
    targetAudience: input.plan.targetAudience, contentGoal: input.plan.contentGoal, contentType: input.plan.recommendedContentType,
    selectedPublishingAccountIds: [...new Set(input.selectedPublishingAccountIds)],
    ...(input.selectedPublishingAccountIds.length === 1 ? { publishingAccountId: input.selectedPublishingAccountIds[0], platform: "tistory" } : {}),
    title: input.plan.suggestedTitleAngles[0] ?? keyword,
    body: "", status: "planning", creationMethod: "natural_language", createdAt: input.now, updatedAt: input.now,
    ...(project.strategy?.defaultTistoryCategory ? { publishingPreparation: { tistory: { publishingAccountId: project.strategy.defaultTistoryCategory.publishingAccountId, platformCategoryId: project.strategy.defaultTistoryCategory.id, platformCategoryName: project.strategy.defaultTistoryCategory.name, updatedAt: input.now } } } : {}),
  };
  return { ...data, contents: [...data.contents, content] };
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
function defaultProjectStrategy(name: string, description: string): ProjectContentStrategy { return { primaryTopic: name, subtopics: description ? [description] : [], excludedTopics: [], defaultContentType: "Google SEO 장문 블로그", defaultPlatform: "tistory", targetLength: "4,500~6,000자", targetAudience: "주제에 관심 있는 일반 독자", tone: "친절하고 신뢰할 수 있는 설명", internalLinkPolicy: "본문 중간 실제 공개 글 1개 자동 배치", relatedPostPolicy: "문서 마지막 실제 공개 글 최대 3개 자동 배치", ctaPolicy: "필요한 경우 최대 1~2개", imageStrategy: "주요 섹션에 설명적인 ALT가 있는 이미지 placeholder", seoPolicy: "Helpful · Reliable · People-first" }; }

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
  const nonTextBlocks = content.document?.blocks.filter((block) => block.type !== "heading" && block.type !== "paragraph") ?? [];
  return Object.freeze({ id: content.document?.id ?? content.id, title, blocks: Object.freeze([...editable, ...nonTextBlocks]) });
}

export function documentToEditableText(document: ContentDocument): string {
  return document.blocks.flatMap((block) => {
    if (block.type === "heading") return [`${"#".repeat(block.level)} ${block.text}`];
    if (block.type === "paragraph") return [block.text];
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
