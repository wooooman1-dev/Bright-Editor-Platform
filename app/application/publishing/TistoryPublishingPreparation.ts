import { access } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import {
  evaluateApprovalDraftIntegrity,
  evaluateGeneratedClaimVerificationIntegrity,
  resolveApprovalEvidenceRequirement,
  resolveApprovalTemporalRequirement,
} from "../../../core/approval";
import { analyzeLongFormDocument } from "../../../core/content";
import { editorialRevisionId, isStandardQualityApproved, QualityEngine } from "../../../core/quality";
import { PublishingPermissionGate } from "../../../core/publishing";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../settings/WorkspaceSettingsService";
import { resolveProjectStrategy, type UserContent, type UserData, type UserProject } from "../../user-flow/user-data";
import { contentOwnedIdentityContamination } from "./ContentOwnedIdentityPolicy";
import { invalidatePublishingContextDependentStateIfChanged } from "./PublishingContextInvalidation";

export type TistoryReadinessCheck = Readonly<{ key: string; passed: boolean; message: string }>;
export type TistoryReadiness = Readonly<{ ready: boolean; checks: readonly TistoryReadinessCheck[] }>;
export type TistoryCategorySelection = Readonly<{ id: string | null; name: string | null }>;

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
  if (!project || !content) throw new Error("발행 준비 대상 프로젝트와 콘텐츠를 찾을 수 없습니다.");
  const strategy = resolveProjectStrategy(project);
  const next: UserData = {
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
      publishingPreparation: item.publishingPreparation?.tistory?.publishingAccountId === connectionId
        ? item.publishingPreparation
        : withoutTistoryPublishingPreparation(item.publishingPreparation),
      updatedAt,
    } : item),
  };
  return invalidatePublishingContextDependentStateIfChanged(
    content,
    next,
    contentId,
    updatedAt,
  );
}

export function resolveTistoryDefaultCategory(
  project: UserProject,
  connectionId: string,
  categories: readonly Readonly<{ id: string; name: string }>[],
): TistoryCategorySelection | undefined {
  const strategy = resolveProjectStrategy(project);
  const configured = strategy.defaultTistoryCategory?.publishingAccountId === connectionId
    ? strategy.defaultTistoryCategory
    : undefined;
  if (configured) {
    if (configured.id === null) return { id: null, name: configured.name };
    const selected = categories.find((item) => String(item.id) === String(configured.id))
      ?? (configured.name ? categories.find((item) => item.name.trim() === configured.name?.trim()) : undefined);
    return selected
      ? { id: String(selected.id), name: selected.name }
      : { id: configured.id, name: configured.name };
  }
  const selected = categories.find((item) => item.name.trim() === strategy.primaryTopic.trim());
  return selected ? { id: String(selected.id), name: selected.name } : undefined;
}

export function applyTistoryPublishingCategory(
  data: UserData,
  projectId: string,
  contentId: string,
  connectionId: string,
  category: TistoryCategorySelection,
  updatedAt: string,
): UserData {
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === data.workspace?.id);
  const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId && item.workspaceId === data.workspace?.id);
  if (!project || !content) throw new Error("카테고리 적용 대상 프로젝트와 콘텐츠를 찾을 수 없습니다.");
  const strategy = resolveProjectStrategy(project);
  const next: UserData = {
    ...data,
    projects: data.projects.map((item) => item.id === projectId ? {
      ...item,
      selectedPublishingAccountIds: uniqueAccount(item.selectedPublishingAccountIds, connectionId),
      strategy: {
        ...strategy,
        defaultPublishingAccountId: connectionId,
        defaultTistoryCategory: { publishingAccountId: connectionId, id: category.id, name: category.name },
      },
      updatedAt,
    } : item),
    contents: data.contents.map((item) => item.id === contentId ? {
      ...item,
      platform: "tistory",
      publishingAccountId: connectionId,
      selectedPublishingAccountIds: uniqueAccount(item.selectedPublishingAccountIds, connectionId),
      publishingPreparation: {
        ...item.publishingPreparation,
        tistory: {
          publishingAccountId: connectionId,
          platformCategoryId: category.id,
          platformCategoryName: category.name,
          updatedAt,
        },
      },
      updatedAt,
    } : item),
  };
  return invalidatePublishingContextDependentStateIfChanged(
    content,
    next,
    contentId,
    updatedAt,
  );
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
  const currentRevision = content.document ? editorialRevisionId(content.document) : undefined;
  const currentRuleQuality = content.document ? new QualityEngine().review(content.document, {
    contentType: content.contentType,
    platform: content.platform ?? "tistory",
    primaryKeyword: content.primaryKeyword,
    searchIntent: content.searchIntent,
    opportunity: content.opportunity,
    revisionId: currentRevision,
  }) : undefined;
  const hasDynamicTarget = Boolean(content.document?.metadata?.qualityTarget ?? content.qualityTarget ?? content.opportunity?.qualityTarget);
  const longFormReady = content.document && hasDynamicTarget ? analyzeLongFormDocument(content.document, content.qualityTarget ?? content.opportunity?.qualityTarget) : undefined;
  const longFormPassed = !content.document || !hasDynamicTarget
    || Boolean(longFormReady && longFormReady.violations.length === 0);
  const generatedClaimIntegrity = content.document
    ? evaluateGeneratedClaimVerificationIntegrity({
        document: content.document,
        plan: content.opportunity?.verificationPlan,
        currentRevisionId: currentRevision,
      })
    : Object.freeze({
        passed: !content.opportunity?.verificationPlan,
        reasons: content.opportunity?.verificationPlan
          ? Object.freeze(["검증할 canonical 원고가 없습니다."])
          : Object.freeze([]),
        warnings: Object.freeze([] as readonly string[]),
      });
  const approvalIntegrity = content.document
    ? evaluateApprovalDraftIntegrity(
        content.document,
        resolveApprovalEvidenceRequirement(content.opportunity) !== "not_required",
        resolveApprovalTemporalRequirement(content.opportunity) !== "not_required",
      )
    : Object.freeze({ passed: false, reasons: Object.freeze(["기준 원고가 없습니다."]) });
  const qualityPassed = Boolean(content.quality
    && currentRuleQuality
    && isStandardQualityApproved(content.quality)
    && isStandardQualityApproved(currentRuleQuality)
    && longFormPassed
    && currentRevision
    && content.quality.reviewedRevisionId === currentRevision);
  const localImageCount = content.document?.blocks.filter((block) => block.type === "image" && /^\/api\/media\//i.test(block.source)).length ?? 0;
  const identityContamination = contentOwnedIdentityContamination(data, project, content);
  let permissionPassed = false;
  let mediaPermissionPassed = localImageCount === 0;
  if (connection && owned) {
    const gate = new PublishingPermissionGate();
    try {
      gate.authorize({ workspaceId: data.workspace!.id, projectId: project.id, contentId: content.id, platformConnectionId: connection.id, workflow: "draft.create", finalConfirmation: true }, connection);
      permissionPassed = true;
    } catch { permissionPassed = false; }
    if (localImageCount) {
      try {
        gate.authorize({ workspaceId: data.workspace!.id, projectId: project.id, contentId: content.id, platformConnectionId: connection.id, workflow: "media.upload", finalConfirmation: true }, connection);
        mediaPermissionPassed = true;
      } catch { mediaPermissionPassed = false; }
    }
  }
  const checks: TistoryReadinessCheck[] = [
    { key: "enabled_tistory", passed: enabled, message: enabled ? "작업공간에서 티스토리가 활성화되어 있습니다." : "작업공간 설정에서 티스토리를 활성화해 주세요." },
    { key: "publishing_account", passed: owned && connected && verified && session && accountStored, message: owned && connected && verified && session && accountStored ? `계정 ${connection!.displayName}이 자동 적용되었습니다.` : "연결·검증·세션이 유효한 작업공간 소유 티스토리 계정을 적용해 주세요." },
    { key: "category", passed: categoryStored, message: categoryStored ? (preparation!.platformCategoryId === null ? "카테고리 없음이 명시적으로 적용되었습니다." : `카테고리 ${preparation!.platformCategoryName}이 적용되었습니다.`) : "티스토리 카테고리 또는 카테고리 없음을 선택해 주세요." },
    { key: "planning_identity", passed: identityContamination.length === 0, message: identityContamination.length === 0 ? "기획 주제와 검색 키워드에 프로젝트명 또는 브랜드명이 검색어로 섞이지 않았습니다." : `기존 기획에 검색 주제가 아닌 프로젝트명 또는 브랜드명이 포함되어 있습니다: ${identityContamination.join(", ")}. 새 콘텐츠에서 기획을 다시 실행해 주세요.` },
    { key: "quality", passed: qualityPassed, message: qualityPassed ? `현재 문서 버전의 기본 원고 품질 승인 ${content.quality!.overallScore}점을 확인했습니다.` : "현재 문서 버전의 품질 승인이 필요합니다." },
    { key: "generated_claim_verification", passed: generatedClaimIntegrity.passed, message: !generatedClaimIntegrity.passed
      ? generatedClaimIntegrity.reasons.join(" ") || "현재 원고의 고위험 Claim 검증이 필요합니다."
      : generatedClaimIntegrity.warnings.length
        ? generatedClaimIntegrity.warnings.join(" ")
        : content.opportunity?.verificationPlan
          ? "현재 원고의 고위험 Claim을 저장된 VerificationSnapshot과 다시 검증했습니다."
          : "현재 원고에는 explicit Verification Claim Gate가 필요하지 않습니다." },
    { key: "approval_article_integrity", passed: approvalIntegrity.passed, message: approvalIntegrity.passed ? "현재 승인 준비 원고의 정책·핵심 Claim·공식 출처·중복 무결성을 확인했습니다." : approvalIntegrity.reasons.join(" ") || "현재 승인 준비 원고의 사실·출처 검증이 필요합니다." },
    { key: "media_upload_permission", passed: mediaPermissionPassed, message: localImageCount === 0 ? "외부 업로드가 필요한 로컬 이미지가 없습니다." : mediaPermissionPassed ? `로컬 이미지 ${localImageCount}개의 티스토리 업로드가 허용되었습니다.` : `로컬 이미지 ${localImageCount}개가 있습니다. 설정의 이미지 권한에서 이 계정의 업로드를 허용해 주세요.` },
    { key: "draft_only", passed: policy.publishing.draftOnly && !policy.publishing.publicPublish, message: policy.publishing.draftOnly && !policy.publishing.publicPublish ? "임시글만 저장 정책이 적용되었습니다." : "임시글만 저장 정책을 확인해 주세요." },
    { key: "review_first", passed: policy.publishing.reviewFirst, message: policy.publishing.reviewFirst ? "검토 후 저장 정책이 적용되었습니다." : "검토 후 저장 정책을 확인해 주세요." },
    { key: "permission_gate", passed: permissionPassed, message: permissionPassed ? "권한 검사에서 임시저장이 허용되었습니다." : "이 계정의 임시저장 권한을 확인해 주세요." },
    { key: "final_confirmation", passed: input.finalConfirmation, message: input.finalConfirmation ? "최종 사용자 확인이 완료되었습니다." : "최종 확인이 필요합니다." },
  ];
  return Object.freeze({ ready: checks.filter((check) => check.key !== "final_confirmation").every((check) => check.passed), checks: Object.freeze(checks) });
}

async function storedSessionExists(connection: PlatformConnection, root = path.join(process.cwd(), ".bright-studio")): Promise<boolean> {
  try { await access(path.join(root, "connections", "tistory", connection.id, "storage-state.json")); return true; }
  catch { return false; }
}

function withoutTistoryPublishingPreparation(
  preparation: UserContent["publishingPreparation"],
): UserContent["publishingPreparation"] {
  if (!preparation?.tistory) return preparation;
  return preparation.wordpress ? { wordpress: preparation.wordpress } : undefined;
}

function uniqueAccount(values: readonly string[] | undefined, connectionId: string): readonly string[] {
  return [...new Set([...(values ?? []), connectionId])];
}
