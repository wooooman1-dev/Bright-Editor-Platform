import { NextResponse } from "next/server";

import { ScheduledPublishingApplicationService } from "../../../../application/publishing/ScheduledPublishingApplicationService";
import { studioStore } from "../../../../application/studio-store";
import type { UserData } from "../../../../user-flow/user-data";

/**
 * Removes finished schedule history for one Content. This never touches an
 * external post and never removes an active schedule.
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Readonly<{
      workspaceId?: string;
      projectId?: string;
      contentId?: string;
    }>;
    const workspaceId = required(body.workspaceId);
    const projectId = required(body.projectId);
    const contentId = required(body.contentId);

    const data = await studioStore.get<UserData>("application", "user-data");
    if (data?.workspace?.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");
    const owned = data.contents.some((item) => item.id === contentId
      && item.projectId === projectId
      && (item.workspaceId === undefined || item.workspaceId === workspaceId));
    if (!owned) throw new Error("Content를 찾을 수 없습니다.");

    const result = await new ScheduledPublishingApplicationService(studioStore)
      .removeTerminalSchedules({ workspaceId, contentId });
    // Returning the stored snapshot keeps the open editor from restoring the
    // removed history on its next autosave.
    return NextResponse.json({ removed: result.removed.length, data: result.data });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "예약 기록을 정리하지 못했습니다.",
    }, { status: 400 });
  }
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("필수 요청 정보가 없습니다.");
  return value.trim();
}
