import { NextResponse } from "next/server";

import type { UserData } from "../../user-flow/user-data";
import { PlatformConnectionService } from "../../../core/connections";
import { contentRevisionId, PublishingGate, QualityEngine } from "../../../core/quality";
import { classifyTistoryDraftOutcome } from "../../../apps/tistory/workflows/TistoryDraftOutcome";
import { connectionRepository, connectionStore, targetRepository } from "../../application/connections/connection-runtime";
import { studioStore } from "../../application/studio-store";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { TistoryCategoryApplicationService } from "../../application/publishing/TistoryCategoryApplicationService";
import { assertContentOwnedIdentityClean } from "../../application/publishing/ContentOwnedIdentityPolicy";
import { TistoryDraftApplicationService, type PublishingAuditRecord } from "../../application/publishing/TistoryDraftApplicationService";
import { isRetryableDraftStartupFailure, normalizeDraftStartupFailure } from "../../application/publishing/TistoryDraftStartupRecovery";
import { applyTistoryPublishingAccount, applyTistoryPublishingCategory, calculateTistoryReadiness, resolveTistoryDefaultCategory, usableTistoryConnections } from "../../application/publishing/TistoryPublishingPreparation";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = required(url.searchParams.get("workspaceId")), projectId = required(url.searchParams.get("projectId")), contentId = required(url.searchParams.get("contentId"));
    const data = await ownedContext(workspaceId, projectId, contentId);
    const project = data.projects.find((item) => item.id === projectId)!;
    const content = data.contents.find((item) => item.id === contentId)!;
    const connectionId = url.searchParams.get("connectionId") || content.publishingAccountId || project.strategy?.defaultPublishingAccountId;
    const connection = connectionId ? await connectionRepository.findById(connectionId) : undefined;
    const selectedTarget = connection ? await hasSelectedTarget(projectId, content, project, connection.id) : false;
    return NextResponse.json({ readiness: await calculateTistoryReadiness({ data, project, content, connection, selectedTarget, finalConfirmation: url.searchParams.get("finalConfirmation") === "true" }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "티스토리 저장 준비 상태 확인에 실패했습니다." }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: "prepare" | "body_editor_probe" | "category_verification_probe" | "draft_reopen_verify"; workspaceId?: string; projectId?: string; contentId?: string; connectionId?: string; finalConfirmation?: boolean };
    if (body.action !== undefined && body.action !== "prepare" && body.action !== "body_editor_probe" && body.action !== "category_verification_probe" && body.action !== "draft_reopen_verify") throw new Error("요청한 티스토리 작업이 등록되어 있지 않습니다.");
    const workspaceId = required(body.workspaceId), projectId = required(body.projectId), contentId = required(body.contentId);
    const data = await ownedContext(workspaceId, projectId, contentId);
    if (body.action === "prepare") return prepare(data, projectId, contentId, body.connectionId);
    const connectionId = required(body.connectionId);
    if (!isPlatformEnabled(data, "tistory")) throw new Error("작업공간 설정에서 티스토리가 비활성화되어 있습니다.");
    const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
    const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId);
    if (!project || !content?.document) throw new Error("기준 원고를 찾을 수 없습니다.");
    assertContentOwnedIdentityClean(data, project, content);
    const policy = resolveWorkspaceSettings(data);
    if (!policy.publishing.draftOnly || policy.publishing.publicPublish) throw new Error("현재 작업공간은 안전한 임시저장 정책만 사용할 수 있습니다.");
    if (policy.publishing.reviewFirst && body.finalConfirmation !== true) throw new Error("검토 후 최종 확인이 필요합니다.");
    const revisionId = contentRevisionId(content.document);
    if (!content.quality) throw new Error("최근 편집 이후 품질 검토를 통과해야 외부 임시저장을 실행할 수 있습니다.");
    new PublishingGate().assertReady(content.quality, revisionId, content.document);
    const quality = new QualityEngine().review(content.document, { contentType: content.contentType, platform: "tistory", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, revisionId });
    new PublishingGate().assertReady(quality, revisionId, content.document);
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new Error("발행 계정을 찾을 수 없습니다.");
    const targets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
    const selectedTarget = (content.selectedPublishingAccountIds?.includes(connectionId) || project.selectedPublishingAccountIds?.includes(connectionId) || content.publishingAccountId === connectionId)
      && targets.some((target) => target.platformConnectionId === connectionId);
    const audits = { save: (record: PublishingAuditRecord) => connectionStore.set("publishing-audits", record.operationId, record) };
    const preparation = content.publishingPreparation?.tistory;
    if (!preparation || preparation.publishingAccountId !== connectionId) throw new Error("티스토리 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
    const diagnosticMode = body.action === "body_editor_probe" || body.action === "category_verification_probe" || body.action === "draft_reopen_verify" ? body.action : undefined;
    const execution = { workspaceId, projectId, contentId, connection, document: content.document, primaryKeyword: content.primaryKeyword, finalConfirmation: body.finalConfirmation === true, selectedTarget, categoryId: preparation.platformCategoryId, categoryName: preparation.platformCategoryName, ...(diagnosticMode ? { diagnosticMode } : {}) };
    const service = new TistoryDraftApplicationService(audits);
    const hasLocalMedia = content.document.blocks.some((block) => block.type === "image" && /^\/api\/media\//i.test(block.source));
    let result = await service.execute(execution);
    let attempts = 1;
    if (!diagnosticMode && !hasLocalMedia && isRetryableDraftStartupFailure(result)) {
      attempts = 2;
      result = await service.execute(execution);
    }
    if (isRetryableDraftStartupFailure(result)) result = normalizeDraftStartupFailure(result, attempts);

    const outcome = classifyTistoryDraftOutcome(result);
    await synchronizeTistorySessionState(connectionId, outcome.status, outcome.diagnosticCode);
    const failed = outcome.status === "failed";
    const failedRecord = result.steps?.find((step) => !step.passed);
    return NextResponse.json({
      result,
      outcome,
      ...(failed ? {
        error: result.error ?? "티스토리 임시저장 작업을 완료하지 못했습니다.",
        failedStep: result.failedStep,
        diagnosticCode: failedRecord?.diagnosticCode,
        runtimeFailure: result.diagnostic?.runtimeFailure,
      } : {}),
    }, { status: failed ? 400 : 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "티스토리 임시저장에 실패했습니다." }, { status: 400 }); }
}
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("필수 발행 정보가 없습니다."); return value.trim(); }

async function ownedContext(workspaceId: string, projectId: string, contentId: string): Promise<UserData> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) throw new Error("작업공간을 찾을 수 없습니다.");
  if (!isPlatformEnabled(data, "tistory")) throw new Error("작업공간 설정에서 티스토리가 비활성화되어 있습니다.");
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId && item.workspaceId === workspaceId);
  if (!project || !content) throw new Error("프로젝트 또는 콘텐츠를 찾을 수 없습니다.");
  return data;
}

async function prepare(data: UserData, projectId: string, contentId: string, requestedConnectionId?: string) {
  const available = await usableTistoryConnections(data, await connectionRepository.listByWorkspace(data.workspace!.id));
  const connection = requestedConnectionId ? available.find((item) => item.id === requestedConnectionId) : available.length === 1 ? available[0] : undefined;
  if (!connection) {
    const project = data.projects.find((item) => item.id === projectId)!;
    const content = data.contents.find((item) => item.id === contentId)!;
    return NextResponse.json({ data, connectionId: null, automaticallyApplied: false, readiness: await calculateTistoryReadiness({ data, project, content, selectedTarget: false, finalConfirmation: false }) });
  }
  await new PlatformConnectionService(connectionRepository, targetRepository).selectTarget(data.projects.find((item) => item.id === projectId)!, connection.id);
  const updatedAt = new Date().toISOString();
  let next = applyTistoryPublishingAccount(data, projectId, contentId, connection.id, updatedAt);
  let project = next.projects.find((item) => item.id === projectId)!;
  let content = next.contents.find((item) => item.id === contentId)!;
  if (content.publishingPreparation?.tistory?.publishingAccountId !== connection.id) {
    try {
      const categoryResult = await new TistoryCategoryApplicationService().read({ workspaceId: next.workspace!.id, projectId, contentId, connection, selectedTarget: true });
      const category = resolveTistoryDefaultCategory(project, connection.id, categoryResult.categories);
      if (category) {
        next = applyTistoryPublishingCategory(next, projectId, contentId, connection.id, category, updatedAt);
        project = next.projects.find((item) => item.id === projectId)!;
        content = next.contents.find((item) => item.id === contentId)!;
        console.info("[tistory-preparation] category auto-applied", { categoryId: category.id, categoryName: category.name, connectionId: connection.id, contentId, projectId });
      } else {
        console.info("[tistory-preparation] no matching default category", { connectionId: connection.id, contentId, projectId, projectTopic: project.strategy?.primaryTopic ?? project.name });
      }
    } catch (error) {
      console.warn("[tistory-preparation] category auto-apply unavailable", { connectionId: connection.id, contentId, error: error instanceof Error ? error.message : "카테고리 준비에 실패했습니다.", projectId });
    }
  }
  await studioStore.set("application", "user-data", next);
  return NextResponse.json({ data: next, connectionId: connection.id, automaticallyApplied: !requestedConnectionId && available.length === 1, readiness: await calculateTistoryReadiness({ data: next, project, content, connection, selectedTarget: true, finalConfirmation: false }) });
}

async function synchronizeTistorySessionState(connectionId: string, outcomeStatus: string, diagnosticCode?: string): Promise<void> {
  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.platform !== "tistory") return;
  const checkedAt = new Date().toISOString();
  if (diagnosticCode === "session_expired") {
    await connectionRepository.save({
      ...connection,
      status: "expired",
      updatedAt: checkedAt,
      publicMetadata: {
        ...connection.publicMetadata,
        sessionStateAvailable: false,
        safeError: "티스토리 로그인 세션이 만료되었습니다. 다시 연결해 주세요.",
      },
    });
    return;
  }
  if (outcomeStatus === "verified" || outcomeStatus === "saved_unverified") {
    await connectionRepository.save({
      ...connection,
      status: "connected",
      lastVerifiedAt: checkedAt,
      updatedAt: checkedAt,
      publicMetadata: {
        ...connection.publicMetadata,
        sessionStateAvailable: true,
        safeError: undefined,
      },
    });
  }
}

async function hasSelectedTarget(projectId: string, content: UserData["contents"][number], project: UserData["projects"][number], connectionId: string) {
  const targets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
  return Boolean((content.selectedPublishingAccountIds?.includes(connectionId) || project.selectedPublishingAccountIds?.includes(connectionId) || content.publishingAccountId === connectionId)
    && targets.some((target) => target.platformConnectionId === connectionId));
}
