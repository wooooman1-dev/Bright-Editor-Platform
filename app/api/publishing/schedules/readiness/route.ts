import { NextResponse } from "next/server";

import type { ScheduledPublishingRecord } from "../../../../../core/publishing";
import type { UserData } from "../../../../user-flow/user-data";
import { connectionRepository, targetRepository } from "../../../../application/connections/connection-runtime";
import { isPlatformEnabled } from "../../../../application/settings/WorkspaceSettingsService";
import { calculateTistoryScheduleReadiness } from "../../../../application/publishing/TistoryScheduleReadiness";
import { studioStore } from "../../../../application/studio-store";

export async function POST(request: Request) {
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
    const workspaceId = required(body.workspaceId);
    const projectId = required(body.projectId);
    const contentId = required(body.contentId);
    const connectionId = required(body.connectionId);
    const scheduledAt = required(body.scheduledAt);
    const timezone = required(body.timezone);
    if (timezone !== "Asia/Seoul") {
      throw new Error("Tistory 예약 발행 MVP는 Asia/Seoul 시간대만 사용할 수 있습니다.");
    }

    const data = await ownedContext(workspaceId, projectId, contentId);
    const project = data.projects.find((item) => item.id === projectId)!;
    const content = data.contents.find((item) => item.id === contentId)!;
    const connection = await connectionRepository.findById(connectionId);
    const selectedTarget = connection ? await hasSelectedTarget(projectId, content, project, connection.id) : false;
    const readiness = await calculateTistoryScheduleReadiness({
      data,
      project,
      content,
      connection,
      selectedTarget,
      scheduledAt,
      timezone,
      finalConfirmation: body.finalConfirmation === true,
      scheduledPublishing: data.scheduledPublishing as unknown as readonly ScheduledPublishingRecord[] | undefined,
    });
    return NextResponse.json({ readiness });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "예약 발행 준비 상태를 확인하지 못했습니다.",
    }, { status: 400 });
  }
}

async function ownedContext(workspaceId: string, projectId: string, contentId: string): Promise<UserData> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");
  if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory is disabled in Workspace Settings.");
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = data.contents.find((item) => (
    item.id === contentId
    && item.projectId === projectId
    && (item.workspaceId === undefined || item.workspaceId === workspaceId)
  ));
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

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Required scheduling context is missing.");
  return value.trim();
}
