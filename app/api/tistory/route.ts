import { NextResponse } from "next/server";

import type { UserData } from "../../user-flow/user-data";
import { PlatformConnectionService } from "../../../core/connections";
import { contentRevisionId, PublishingGate, QualityEngine } from "../../../core/quality";
import { connectionRepository, connectionStore, targetRepository } from "../../application/connections/connection-runtime";
import { expireTistorySession, isTistorySessionExpiredFailure } from "../../application/connections/TistorySessionState";
import { studioStore } from "../../application/studio-store";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { TistoryDraftApplicationService, type PublishingAuditRecord } from "../../application/publishing/TistoryDraftApplicationService";
import { isRetryableDraftStartupFailure, normalizeDraftStartupFailure } from "../../application/publishing/TistoryDraftStartupRecovery";
import { applyTistoryPublishingAccount, calculateTistoryReadiness, usableTistoryConnections } from "../../application/publishing/TistoryPublishingPreparation";

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
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Tistory readiness 확인에 실패했습니다." }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: "prepare" | "body_editor_probe" | "category_verification_probe" | "draft_reopen_verify"; workspaceId?: string; projectId?: string; contentId?: string; connectionId?: string; finalConfirmation?: boolean };
    if (body.action !== undefined && body.action !== "prepare" && body.action !== "body_editor_probe" && body.action !== "category_verification_probe" && body.action !== "draft_reopen_verify") throw new Error("The requested Tistory workflow is not registered.");
    const workspaceId = required(body.workspaceId), projectId = required(body.projectId), contentId = required(body.contentId);
    const data = await ownedContext(workspaceId, projectId, contentId);
    if (body.action === "prepare") return prepare(data, projectId, contentId, body.connectionId);
    const connectionId = required(body.connectionId);
    if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory is disabled in Workspace Settings.");
    const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
    const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId);
    if (!project || !content?.document) throw new Error("Canonical content was not found.");
    const policy = resolveWorkspaceSettings(data);
    if (!policy.publishing.draftOnly || policy.publishing.publicPublish) throw new Error("현재 워크스페이스는 안전한 임시저장 정책만 사용할 수 있습니다.");
    if (policy.publishing.reviewFirst && body.finalConfirmation !== true) throw new Error("검토 후 최종 확인이 필요합니다.");
    const revisionId = contentRevisionId(content.document);
    if (!content.quality) throw new Error("Quality Review must pass after the latest edit before external draft save.");
    new PublishingGate().assertReady(content.quality, revisionId);
    const quality = new QualityEngine().review(content.document, { contentType: content.contentType, platform: "tistory", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, revisionId });
    new PublishingGate().assertReady(quality, revisionId);
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new Error("Publishing account was not found.");
    const targets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
    const selectedTarget = (content.selectedPublishingAccountIds?.includes(connectionId) || project.selectedPublishingAccountIds?.includes(connectionId) || content.publishingAccountId === connectionId)
      && targets.some((target) => target.platformConnectionId === connectionId);
    const audits = { save: (record: PublishingAuditRecord) => connectionStore.set("publishing-audits", record.operationId, record) };
    const preparation = content.publishingPreparation?.tistory;
    if (!preparation || preparation.publishingAccountId !== connectionId) throw new Error("Tistory 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
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
    if (isTistorySessionExpiredFailure(result)) {
      await connectionRepository.save(expireTistorySession(connection, new Date().toISOString()));
    }

    const failed = result.status === "failed" || result.status === "partial_failure";
    const failedRecord = result.steps?.find((step) => !step.passed);
    return NextResponse.json({
      result,
      ...(failed ? {
        error: result.error ?? "Tistory 임시저장 작업을 완료하지 못했습니다.",
        failedStep: result.failedStep,
        diagnosticCode: failedRecord?.diagnosticCode,
        runtimeFailure: result.diagnostic?.runtimeFailure,
      } : {}),
    }, { status: failed ? 400 : 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Tistory draft save failed." }, { status: 400 }); }
}
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("Required publishing context is missing."); return value.trim(); }

async function ownedContext(workspaceId: string, projectId: string, contentId: string): Promise<UserData> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) throw new Error("Workspace was not found.");
  if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory is disabled in Workspace Settings.");
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId && item.workspaceId === workspaceId);
  if (!project || !content) throw new Error("Project 또는 Content를 찾을 수 없습니다.");
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
  const next = applyTistoryPublishingAccount(data, projectId, contentId, connection.id, updatedAt);
  await studioStore.set("application", "user-data", next);
  const project = next.projects.find((item) => item.id === projectId)!;
  const content = next.contents.find((item) => item.id === contentId)!;
  return NextResponse.json({ data: next, connectionId: connection.id, automaticallyApplied: !requestedConnectionId && available.length === 1, readiness: await calculateTistoryReadiness({ data: next, project, content, connection, selectedTarget: true, finalConfirmation: false }) });
}

async function hasSelectedTarget(projectId: string, content: UserData["contents"][number], project: UserData["projects"][number], connectionId: string) {
  const targets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
  return Boolean((content.selectedPublishingAccountIds?.includes(connectionId) || project.selectedPublishingAccountIds?.includes(connectionId) || content.publishingAccountId === connectionId)
    && targets.some((target) => target.platformConnectionId === connectionId));
}
