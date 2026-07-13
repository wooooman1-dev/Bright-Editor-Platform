import { NextResponse } from "next/server";

import type { UserData } from "../../user-flow/user-data";
import { contentRevisionId, PublishingGate, QualityEngine } from "../../../core/quality";
import { connectionRepository, connectionStore, targetRepository } from "../../application/connections/connection-runtime";
import { studioStore } from "../../application/studio-store";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { TistoryDraftApplicationService, type PublishingAuditRecord } from "../../application/publishing/TistoryDraftApplicationService";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { workspaceId?: string; projectId?: string; contentId?: string; connectionId?: string; finalConfirmation?: boolean };
    const data = await studioStore.get<UserData>("application", "user-data");
    const workspaceId = required(body.workspaceId), projectId = required(body.projectId), contentId = required(body.contentId), connectionId = required(body.connectionId);
    if (data?.workspace?.id !== workspaceId) throw new Error("Workspace was not found.");
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
    const selectedTarget = (content.selectedPublishingAccountIds ?? project.selectedPublishingAccountIds ?? []).includes(connectionId)
      && targets.some((target) => target.platformConnectionId === connectionId);
    const audits = { save: (record: PublishingAuditRecord) => connectionStore.set("publishing-audits", record.operationId, record) };
    const preparation = content.publishingPreparation?.tistory;
    if (!preparation || preparation.publishingAccountId !== connectionId) throw new Error("Tistory 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
    const result = await new TistoryDraftApplicationService(audits).execute({ workspaceId, projectId, contentId, connection, document: content.document, finalConfirmation: body.finalConfirmation === true, selectedTarget, categoryId: preparation.platformCategoryId });
    return NextResponse.json({ result }, { status: result.status === "failed" ? 400 : 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Tistory draft save failed." }, { status: 400 }); }
}
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("Required publishing context is missing."); return value.trim(); }
