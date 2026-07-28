import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import type { UserData } from "../../../../user-flow/user-data";
import { TistoryPublishingAdapter } from "../../../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { contentRevisionId } from "../../../../../core/quality";
import { isScheduledPublication, type ScheduledPublication, type ScheduledPublishingRecord } from "../../../../../core/publishing";
import { connectionRepository, connectionStore, targetRepository } from "../../../../application/connections/connection-runtime";
import { resolveWorkspaceSettings, isPlatformEnabled } from "../../../../application/settings/WorkspaceSettingsService";
import { ScheduledPublishingApplicationService } from "../../../../application/publishing/ScheduledPublishingApplicationService";
import { TistoryScheduleCreateApplicationService, type TistoryScheduleCreateAuditRecord } from "../../../../application/publishing/TistoryScheduleCreateApplicationService";
import { calculateTistoryScheduleReadiness } from "../../../../application/publishing/TistoryScheduleReadiness";
import { studioStore } from "../../../../application/studio-store";

export async function POST(request: Request) {
  let workspaceId = "";
  let scheduleId = "";
  let reserved = false;
  try {
    const body = await request.json() as Readonly<{
      workspaceId?: string;
      projectId?: string;
      contentId?: string;
      connectionId?: string;
      scheduledAt?: string;
      timezone?: string;
      finalConfirmation?: boolean;
    }>;
    workspaceId = required(body.workspaceId);
    const projectId = required(body.projectId);
    const contentId = required(body.contentId);
    const connectionId = required(body.connectionId);
    const scheduledAt = required(body.scheduledAt);
    const timezone = required(body.timezone);
    if (timezone !== "Asia/Seoul") throw new Error("Tistory 예약 발행은 Asia/Seoul 시간대만 사용할 수 있습니다.");
    if (body.finalConfirmation !== true) throw new Error("예약 등록 전 최종 사용자 확인이 필요합니다.");

    const data = await ownedContext(workspaceId, projectId, contentId);
    const policy = resolveWorkspaceSettings(data);
    const rawPublishing = rawStoredPublishingPolicy(data);
    if (!policy.publishing.reviewFirst || !policy.publishing.draftOnly || policy.publishing.publicPublish
      || rawPublishing.draftOnly === false || rawPublishing.publicPublish === true) {
      throw new Error("현재 Workspace의 Review First · Draft Only 정책에서만 Tistory 예약 등록을 실행할 수 있습니다.");
    }

    const project = data.projects.find((item) => item.id === projectId)!;
    const content = data.contents.find((item) => item.id === contentId)!;
    if (!content.document) throw new Error("예약 등록할 canonical ContentDocument가 없습니다.");
    const connection = await connectionRepository.findById(connectionId);
    if (!connection || connection.workspaceId !== workspaceId || connection.platform !== "tistory") {
      throw new Error("현재 Workspace의 Tistory 발행 계정을 찾을 수 없습니다.");
    }
    const selectedTarget = await hasSelectedTarget(projectId, content, project, connectionId);
    const readiness = await calculateTistoryScheduleReadiness({
      data,
      project,
      content,
      connection,
      selectedTarget,
      scheduledAt,
      timezone,
      finalConfirmation: true,
      scheduledPublishing: data.scheduledPublishing as unknown as readonly ScheduledPublishingRecord[] | undefined,
    });
    if (!readiness.executable) {
      return NextResponse.json({
        error: "예약 발행 준비 조건을 모두 통과하지 못했습니다.",
        readiness,
      }, { status: 400 });
    }

    const localImages = content.document.blocks.filter((block) => block.type === "image" && /^\/api\/media\//i.test(block.source));
    if (localImages.length) {
      throw new Error("로컬 이미지가 포함된 원고의 예약발행은 이미지 업로드 통합 후 사용할 수 있습니다. 현재 원고에서 로컬 이미지를 외부 URL로 준비해 주세요.");
    }

    const revisionId = contentRevisionId(content.document);
    const preparation = content.publishingPreparation?.tistory;
    if (!preparation || preparation.publishingAccountId !== connectionId) {
      throw new Error("Tistory 카테고리를 선택하거나 카테고리 없음을 명시해 주세요.");
    }
    const prepared = await new TistoryPublishingAdapter().prepare({
      content: content.document,
      platform: "tistory",
      scheduledFor: scheduledAt,
    });

    scheduleId = `schedule-${randomUUID()}`;
    const operationId = `schedule-operation-${randomUUID()}`;
    const schedules = new ScheduledPublishingApplicationService(studioStore);
    const reservation = await schedules.reserve({
      id: scheduleId,
      workspaceId,
      projectId,
      contentId,
      platform: "tistory",
      platformConnectionId: connectionId,
      revisionId,
      scheduledAt,
      timezone,
      categoryId: preparation.platformCategoryId,
      categoryName: preparation.platformCategoryName,
      operationId,
    });
    scheduleId = reservation.reservation.id;
    if (!reservation.created) {
      return NextResponse.json({
        result: { status: "existing", schedule: reservation.reservation },
        readiness,
      });
    }
    reserved = true;
    await schedules.beginAttempt({ workspaceId, scheduleId });

    const audits = {
      save: (record: TistoryScheduleCreateAuditRecord) => connectionStore.set("publishing-audits", record.operationId, record),
    };
    const execution = await new TistoryScheduleCreateApplicationService(audits).execute({
      workspaceId,
      projectId,
      contentId,
      connection,
      selectedTarget,
      revisionId,
      title: prepared.payload.title,
      html: prepared.payload.html,
      tags: prepared.payload.tags ?? [],
      categoryId: preparation.platformCategoryId,
      categoryName: preparation.platformCategoryName,
      scheduledAt,
      timezone: "Asia/Seoul",
      finalConfirmation: true,
    });

    const schedule = await transitionResult(schedules, workspaceId, scheduleId, execution);
    return NextResponse.json({
      result: execution,
      schedule,
      readiness,
    }, { status: execution.status === "failed" ? 400 : 200 });
  } catch (error) {
    if (reserved && workspaceId && scheduleId) {
      try {
        await new ScheduledPublishingApplicationService(studioStore).transition({
          workspaceId,
          scheduleId,
          status: "failed",
          failureCode: errorCode(error),
          lastError: error instanceof Error ? error.message : "Tistory 예약 등록을 완료하지 못했습니다.",
        });
      } catch {
        // Preserve the original error. Interrupted registering records are recovered as unverified by the recovery policy.
      }
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Tistory 예약 등록을 완료하지 못했습니다.",
      diagnosticCode: errorCode(error),
    }, { status: 400 });
  }
}

async function transitionResult(
  schedules: ScheduledPublishingApplicationService,
  workspaceId: string,
  scheduleId: string,
  result: Awaited<ReturnType<TistoryScheduleCreateApplicationService["execute"]>>,
): Promise<ScheduledPublication> {
  if (result.status === "scheduled_verified") {
    return schedules.transition({
      workspaceId,
      scheduleId,
      status: "scheduled_verified",
      registeredAt: result.registeredAt!,
      verifiedAt: result.verifiedAt!,
      externalPostId: result.externalPostId,
      externalManagementUrl: result.externalManagementUrl,
    });
  }
  if (result.status === "scheduled_unverified") {
    return schedules.transition({
      workspaceId,
      scheduleId,
      status: "scheduled_unverified",
      registeredAt: result.registeredAt,
      externalPostId: result.externalPostId,
      externalManagementUrl: result.externalManagementUrl,
      failureCode: result.diagnosticCode ?? "TISTORY_SCHEDULE_UNVERIFIED",
      lastError: result.error ?? "Tistory 외부 예약 상태를 다시 확인해야 합니다.",
    });
  }
  return schedules.transition({
    workspaceId,
    scheduleId,
    status: "failed",
    failureCode: result.diagnosticCode ?? "TISTORY_SCHEDULE_CREATE_FAILED",
    lastError: result.error ?? "Tistory 예약 등록을 완료하지 못했습니다.",
  });
}

async function ownedContext(workspaceId: string, projectId: string, contentId: string): Promise<UserData> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");
  if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory is disabled in Workspace Settings.");
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId && (item.workspaceId === undefined || item.workspaceId === workspaceId));
  if (!project || !content) throw new Error("Project 또는 Content를 찾을 수 없습니다.");
  return data;
}

async function hasSelectedTarget(
  projectId: string,
  content: UserData["contents"][number],
  project: UserData["projects"][number],
  connectionId: string,
): Promise<boolean> {
  const targets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
  const selected = content.selectedPublishingAccountIds?.includes(connectionId)
    || project.selectedPublishingAccountIds?.includes(connectionId)
    || content.publishingAccountId === connectionId;
  return Boolean(selected && targets.some((target) => target.platformConnectionId === connectionId));
}

function rawStoredPublishingPolicy(data: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(data) || !isRecord(data.workspace) || !isRecord(data.workspace.settings) || !isRecord(data.workspace.settings.publishing)) return Object.freeze({});
  return data.workspace.settings.publishing;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Required scheduling context is missing.");
  return value.trim();
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "TISTORY_SCHEDULE_CREATE_FAILED";
}
