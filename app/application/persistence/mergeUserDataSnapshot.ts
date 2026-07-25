import type { MediaAsset } from "../../../core/media";
import { assertConfirmedContentOpportunity, hasCurrentContentOpportunityFingerprint } from "../../../core/content";
import type { UserContent, UserData } from "../../user-flow/user-data";

export function mergeUserDataSnapshot(current: UserData | undefined, input: unknown): UserData {
  const incoming = assertUserDataSnapshot(input);
  if (!current) return incoming;

  const incomingContentIds = new Set(incoming.contents.map((content) => content.id));
  const contents = [...incoming.contents.map((content) => {
    const serverContent = current.contents.find((item) => item.id === content.id);
    if (serverContent && sameValue(content, serverContent)) return serverContent;
    if (serverContent && isOlderSnapshot(content.updatedAt, serverContent.updatedAt)) return serverContent;
    const planningProtectedContent = preserveNewerPlanningWorkflow(serverContent, content);
    const preserveServerOpportunity = serverContent?.opportunity
      && !isNewerConfirmedOpportunitySelection(serverContent, planningProtectedContent);
    const opportunityProtectedContent = preserveServerOpportunity ? Object.freeze({
      ...planningProtectedContent,
      opportunity: serverContent.opportunity,
      primaryKeyword: serverContent.opportunity.primaryKeyword,
      relatedKeywords: serverContent.opportunity.secondaryKeywords,
      searchIntent: serverContent.opportunity.searchIntent,
      targetAudience: serverContent.opportunity.audience,
      contentGoal: serverContent.opportunity.contentAngle,
      contentType: serverContent.opportunity.contentType,
    }) : planningProtectedContent;
    const protectedContent = validatePlanningContent(opportunityProtectedContent, serverContent);
    if (serverContent?.quality) return Object.freeze({ ...protectedContent, quality: serverContent.quality });
    const { quality: _clientQuality, ...withoutClientQuality } = protectedContent;
    void _clientQuality;
    return Object.freeze(withoutClientQuality);
  }), ...current.contents.filter((content) => !incomingContentIds.has(content.id))];

  return Object.freeze({
    ...incoming,
    contents: Object.freeze(contents),
    history: frozenCopy(current.history ?? incoming.history),
    mediaMetadata: frozenCopy(current.mediaMetadata ?? incoming.mediaMetadata),
    publishingRecords: frozenCopy(current.publishingRecords ?? incoming.publishingRecords),
    qualityReports: frozenCopy(current.qualityReports ?? incoming.qualityReports),
    scheduledPublishing: frozenCopy(current.scheduledPublishing ?? incoming.scheduledPublishing),
  });
}

export function mergeServerMutationSnapshot(current: UserData | undefined, base: UserData, next: UserData): UserData {
  if (!current) return next;
  return Object.freeze({
    ...next,
    contents: mergeChangedContents(current.contents, base.contents, next.contents),
    history: mergeChangedByKey(current.history, base.history, next.history, (item) => item.id),
    mediaMetadata: mergeChangedMediaAssets(current.mediaMetadata, base.mediaMetadata, next.mediaMetadata),
    publishingRecords: mergeChangedByKey(current.publishingRecords, base.publishingRecords, next.publishingRecords, (item) => item.id),
    qualityReports: mergeChangedByKey(current.qualityReports, base.qualityReports, next.qualityReports, (item) => item.contentId),
    scheduledPublishing: mergeChangedByKey(current.scheduledPublishing, base.scheduledPublishing, next.scheduledPublishing, (item) => `${item.contentId}:${item.platform}`),
  });
}

function preserveNewerPlanningWorkflow(server: UserContent | undefined, incoming: UserContent): UserContent {
  const currentWorkflow = server?.planningWorkflow;
  const incomingWorkflow = incoming.planningWorkflow;
  if (!currentWorkflow) return incoming;
  if (incomingWorkflow?.status === "failed") {
    return Object.freeze({
      ...incoming,
      planningWorkflow: incomingWorkflow,
      planning: server?.planning,
      naturalLanguageRequest: server?.naturalLanguageRequest ?? incoming.naturalLanguageRequest,
    });
  }
  const conflictsAtSameRevision = incomingWorkflow?.revision === currentWorkflow.revision
    && JSON.stringify(incomingWorkflow) !== JSON.stringify(currentWorkflow);
  if (!incomingWorkflow || incomingWorkflow.revision < currentWorkflow.revision || conflictsAtSameRevision) {
    return Object.freeze({
      ...incoming,
      planningWorkflow: currentWorkflow,
      planning: server?.planning,
      naturalLanguageRequest: server?.naturalLanguageRequest,
    });
  }
  return Object.freeze({ ...incoming, planning: server?.planning ?? incoming.planning });
}

function isNewerConfirmedOpportunitySelection(server: UserContent, incoming: UserContent): boolean {
  const serverOpportunity = server.opportunity;
  const incomingOpportunity = incoming.opportunity;
  const serverWorkflow = server.planningWorkflow;
  const incomingWorkflow = incoming.planningWorkflow;
  if (!serverOpportunity || !incomingOpportunity || !incomingWorkflow) return false;
  if (serverOpportunity.opportunityId === incomingOpportunity.opportunityId && serverOpportunity.fingerprint === incomingOpportunity.fingerprint) return false;
  if (incomingWorkflow.selectedOpportunityId !== incomingOpportunity.opportunityId) return false;
  if (!['opportunityConfirmed', 'generating', 'generated'].includes(incomingWorkflow.status)) return false;
  if (serverWorkflow && incomingWorkflow.revision <= serverWorkflow.revision) return false;
  return Boolean(incoming.planning?.opportunityCandidates?.some((candidate) => (
    candidate.opportunityId === incomingOpportunity.opportunityId
    && candidate.fingerprint === incomingOpportunity.fingerprint
  )));
}

function validatePlanningContent(content: UserContent, server?: UserContent): UserContent {
  const candidates = content.planning?.opportunityCandidates ?? [];
  const planningChanged = !server || !sameValue(content.planning, server.planning);
  if (planningChanged && candidates.some((candidate) => candidate.projectId !== content.projectId || !hasCurrentContentOpportunityFingerprint(candidate))) {
    throw new Error("Planning 후보의 Project binding 또는 fingerprint가 유효하지 않습니다.");
  }
  const selectedOpportunityId = content.planningWorkflow?.selectedOpportunityId;
  if (selectedOpportunityId && !candidates.some((candidate) => candidate.opportunityId === selectedOpportunityId)) {
    throw new Error("선택한 Content Opportunity가 저장된 Planning 후보에 없습니다.");
  }
  if (content.opportunity) {
    assertConfirmedContentOpportunity(content.opportunity, {
      workspaceId: content.workspaceId ?? "",
      projectId: content.projectId,
      contentId: content.id,
      opportunityId: content.opportunity.opportunityId,
      opportunityVersion: content.opportunity.version,
      opportunityFingerprint: content.opportunity.fingerprint,
      primaryKeyword: content.primaryKeyword,
      selectedTopic: content.opportunity.selectedTopic,
      searchIntent: content.searchIntent,
      secondaryKeywords: content.relatedKeywords,
    });
    if (candidates.length && !candidates.some((candidate) => candidate.opportunityId === content.opportunity?.opportunityId && candidate.fingerprint === content.opportunity?.fingerprint)) {
      throw new Error("확정한 Content Opportunity가 저장된 Planning 후보와 일치하지 않습니다.");
    }
  }
  return content;
}

function isOlderSnapshot(incoming: string, current: string): boolean {
  const incomingTime = Date.parse(incoming);
  const currentTime = Date.parse(current);
  return Number.isFinite(incomingTime) && Number.isFinite(currentTime) && incomingTime < currentTime;
}

function mergeChangedContents(
  current: readonly UserContent[],
  base: readonly UserContent[],
  next: readonly UserContent[],
): readonly UserContent[] {
  const currentMap = toMap(current, (item) => item.id);
  const baseMap = toMap(base, (item) => item.id);
  const nextMap = toMap(next, (item) => item.id);

  for (const id of baseMap.keys()) {
    if (!nextMap.has(id)) currentMap.delete(id);
  }
  for (const [id, nextContent] of nextMap) {
    const baseContent = baseMap.get(id);
    if (!baseContent) {
      currentMap.set(id, nextContent);
      continue;
    }
    if (sameValue(baseContent, nextContent)) continue;

    const merged = { ...(currentMap.get(id) ?? baseContent) } as Record<string, unknown>;
    const baseRecord = baseContent as unknown as Record<string, unknown>;
    const nextRecord = nextContent as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(baseRecord), ...Object.keys(nextRecord)])) {
      if (sameValue(baseRecord[key], nextRecord[key])) continue;
      if (key in nextRecord) merged[key] = nextRecord[key];
      else delete merged[key];
    }
    currentMap.set(id, Object.freeze(merged) as UserContent);
  }
  return Object.freeze([...currentMap.values()]);
}

function assertUserDataSnapshot(input: unknown): UserData {
  if (!input || typeof input !== "object") throw new Error("Application state is required.");
  const candidate = input as Partial<UserData>;
  if (!Array.isArray(candidate.brands) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.contents)) {
    throw new Error("Application state is invalid.");
  }
  return input as UserData;
}

function frozenCopy<T>(values: readonly T[] | undefined): readonly T[] {
  return Object.freeze([...(values ?? [])]);
}

function mergeChangedByKey<T>(
  current: readonly T[] | undefined,
  base: readonly T[] | undefined,
  next: readonly T[] | undefined,
  keyOf: (item: T) => string,
): readonly T[] {
  const currentMap = toMap(current, keyOf);
  const baseMap = toMap(base, keyOf);
  const nextMap = toMap(next, keyOf);

  for (const key of baseMap.keys()) {
    if (!nextMap.has(key)) currentMap.delete(key);
  }
  for (const [key, item] of nextMap) {
    if (!sameValue(baseMap.get(key), item)) currentMap.set(key, item);
  }
  return Object.freeze([...currentMap.values()]);
}

function mergeChangedMediaAssets(
  current: readonly MediaAsset[] | undefined,
  base: readonly MediaAsset[] | undefined,
  next: readonly MediaAsset[] | undefined,
): readonly MediaAsset[] {
  const merged = [...mergeChangedByKey(current, base, next, (item) => item.id)];
  const bySource = new Map<string, MediaAsset>();
  for (const asset of merged) bySource.set(asset.source, asset);
  return Object.freeze([...bySource.values()]);
}

function toMap<T>(values: readonly T[] | undefined, keyOf: (item: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of values ?? []) result.set(keyOf(item), item);
  return result;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
