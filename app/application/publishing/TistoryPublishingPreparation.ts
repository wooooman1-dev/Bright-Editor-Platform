import { access } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { contentRevisionId, QualityEngine } from "../../../core/quality";
import { PublishingPermissionGate } from "../../../core/publishing";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../settings/WorkspaceSettingsService";
import { resolveProjectStrategy, type UserContent, type UserData, type UserProject } from "../../user-flow/user-data";

export type TistoryReadinessCheck = Readonly<{ key: string; passed: boolean; message: string }>;
export type TistoryReadiness = Readonly<{ ready: boolean; checks: readonly TistoryReadinessCheck[] }>;

export async function usableTistoryConnections(
  data: UserData,
  connections: readonly PlatformConnection[],
  root = path.join(process.cwd(), ".bright-studio"),
): Promise<readonly PlatformConnection[]> {
  if (!data.workspace || !isPlatformEnabled(data, "tistory")) return [];
  const matches = connections.filter((connection) => connection.workspaceId === data.workspace!.id
    && connection.platform === "tistory"
    && connection.status === "connected"
    && Boolean(connection.lastVerifiedAt)
    && connection.publicMetadata.sessionStateAvailable === true);
  const available: PlatformConnection[] = [];
  for (const connection of matches) if (await storedSessionExists(connection, root)) available.push(connection);
  return available;
}

export function applyTistoryPublishingAccount(
  data: UserData,
  projectId: string,
  contentId: string,
  connectionId: string,
  updatedAt: string,
): UserData {
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === data.workspace?.id);
  const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId && item.workspaceId === data.workspace?.id);
  if (!project || !content) throw new Error("발행 준비 대상 Project와 Content를 찾을 수 없습니다.");
  const strategy = resolveProjectStrategy(project);
  const defaultCategory = strategy.defaultTistoryCategory?.publishingAccountId === connectionId ? strategy.defaultTistoryCategory : undefined;
  return {
    ...data,
    projects: data.projects.map((item) => item.id === projectId ? {
      ...item,
      selectedPublishingAccountIds: uniqueAccount(item.selectedPublishingAccountIds, connectionId),
      strategy: { ...strategy, defaultPublishingAccountId: connectionId },
      updatedAt,
    } : item),
    contents: data.contents.map((item) => item.id === contentId ? {
      ...item,
      platform: "tistory",
      publishingAccountId: connectionId,
      selectedPublishingAccountIds: uniqueAccount(item.selectedPublishingAccountIds, connectionId),
      ...(defaultCategory ? { publishingPreparation: { ...item.publishingPreparation, tistory: {
        publishingAccountId: connectionId,
        platformCategoryId: defaultCategory.id,
        platformCategoryName: defaultCategory.name,
        updatedAt,
      } } } : {}),
      updatedAt,
    } : item),
  };
}

export async function calculateTistoryReadiness(input: Readonly<{
  data: UserData;
  project: UserProject;
  content: UserContent;
  connection?: PlatformConnection;
  selectedTarget: boolean;
  finalConfirmation: boolean;
  root?: string;
}>): Promise<TistoryReadiness> {
  const { data, project, content, connection } = input;
  const policy = resolveWorkspaceSettings(data);
  const enabled = isPlatformEnabled(data, "tistory");
  const owned = Boolean(connection && data.workspace && connection.workspaceId === data.workspace.id && connection.platform === "tistory");
  const connected = owned && connection?.status === "connected";
  const verified = connected && Boolean(connection?.lastVerifiedAt);
  const session = Boolean(verified && connection?.publicMetadata.sessionStateAvailable === true && await storedSessionExists(connection!, input.root));
  const accountStored = Boolean(connection
    && project.strategy?.defaultPublishingAccountId === connection.id
    && content.publishingAccountId === connection.id
    && content.selectedPublishingAccountIds?.includes(connection.id)
    && input.selectedTarget);
  const preparation = content.publishingPreparation?.tistory;
  const categoryStored = Boolean(connection && preparation && preparation.publishingAccountId === connection.id);
  const currentRevision = content.document ? contentRevisionId(content.document) : undefined;
  const currentRuleQuality = content.document ? new QualityEngine().review(content.document, { contentType: content.contentType, platform: content.platform ?? "tistory", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, revisionId: currentRevision }) : undefined;
  const qualityPassed = Boolean(content.quality?.approved && currentRuleQuality?.approved && currentRevision && content.quality.reviewedRevisionId === currentRevision);
  let permissionPassed = false;
  if (connection && owned) {
    try {
      new PublishingPermissionGate().authorize({ workspaceId: data.workspace!.id, projectId: project.id, contentId: content.id, platformConnectionId: connection.id, workflow: "draft.create", finalConfirmation: true }, connection);
      permissionPassed = true;
    } catch { permissionPassed = false; }
  }
  const checks: TistoryReadinessCheck[] = [
    { key: "enabled_tistory", passed: enabled, message: enabled ? "티스토리가 Workspace에서 활성화되었습니다." : "Workspace 설정에서 티스토리를 활성화해 주세요." },
    { key: "publishing_account", passed: owned && connected && verified && session && accountStored, message: owned && connected && verified && session && accountStored ? `계정 ${connection!.displayName}이 자동 적용되었습니다.` : "연결·검증·세션이 유효한 Workspace 소유 티스토리 계정을 적용해 주세요." },
    { key: "category", passed: categoryStored, message: categoryStored ? (preparation!.platformCategoryId === null ? "카테고리 없음이 명시적으로 적용되었습니다." : `카테고리 ${preparation!.platformCategoryName}이 적용되었습니다.`) : "티스토리 카테고리 또는 카테고리 없음을 선택해 주세요." },
    { key: "quality", passed: qualityPassed, message: qualityPassed ? `원고 품질 ${currentRuleQuality!.overallScore}점으로 승인되었습니다.` : "현재 원고 Revision의 품질 승인이 필요합니다." },
    { key: "draft_only", passed: policy.publishing.draftOnly && !policy.publishing.publicPublish, message: policy.publishing.draftOnly && !policy.publishing.publicPublish ? "Draft Only 정책이 적용되었습니다." : "Draft Only 정책을 확인해 주세요." },
    { key: "review_first", passed: policy.publishing.reviewFirst, message: policy.publishing.reviewFirst ? "Review First 정책이 적용되었습니다." : "Review First 정책을 확인해 주세요." },
    { key: "permission_gate", passed: permissionPassed, message: permissionPassed ? "Permission Gate에서 임시저장이 허용되었습니다." : "이 계정의 임시저장 권한을 확인해 주세요." },
    { key: "final_confirmation", passed: input.finalConfirmation, message: input.finalConfirmation ? "최종 사용자 확인이 완료되었습니다." : "최종 확인이 필요합니다." },
  ];
  return Object.freeze({ ready: checks.filter((check) => check.key !== "final_confirmation").every((check) => check.passed), checks: Object.freeze(checks) });
}

async function storedSessionExists(connection: PlatformConnection, root = path.join(process.cwd(), ".bright-studio")): Promise<boolean> {
  try { await access(path.join(root, "connections", "tistory", connection.id, "storage-state.json")); return true; }
  catch { return false; }
}

function uniqueAccount(values: readonly string[] | undefined, connectionId: string): readonly string[] {
  return [...new Set([...(values ?? []), connectionId])];
}
