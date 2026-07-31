import { NextResponse } from "next/server";

import type { UserData } from "../../../user-flow/user-data";
import { ApprovalReadinessApplicationService } from "../../../application/approval/ApprovalReadinessApplicationService";
import { connectionRepository } from "../../../application/connections/connection-runtime";
import { resolveCanonicalPublishingConnection } from "../../../application/publishing/ProjectPublishingTarget";
import { studioStore } from "../../../application/studio-store";

const collection = "application";
const stateId = "user-data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      contentId?: string;
    };
    const workspaceId = required(body.workspaceId, "작업공간이 필요합니다.");
    const contentId = required(body.contentId, "콘텐츠가 필요합니다.");
    const data = await studioStore.get<UserData>(collection, stateId);
    if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("작업공간을 찾을 수 없습니다.");

    const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId);
    if (!content) throw new Error("승인 준비 검사 대상 콘텐츠를 찾을 수 없습니다.");

    const connections = await connectionRepository.listByWorkspace(workspaceId);
    const connection = resolveCanonicalPublishingConnection(data, content, connections);
    const result = await new ApprovalReadinessApplicationService().execute({
      data,
      contentId,
      connection,
    });
    await studioStore.set(collection, stateId, result.data);
    const saved = await studioStore.get<UserData>(collection, stateId);

    return NextResponse.json({
      data: saved ?? result.data,
      document: result.document,
      quality: result.quality,
      evidence: {
        status: result.evidence.pack.status,
        reviewedAt: result.evidence.pack.reviewedAt,
        verifiedSourceCount: result.evidence.verifiedSourceCount,
        rejectedSourceCount: result.evidence.rejectedSourceCount,
        reasons: result.evidence.reasons,
        sources: result.evidence.pack.sources,
      },
      siteReadiness: result.siteReadiness,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "승인 준비 검사를 완료하지 못했습니다.",
    }, { status: 400 });
  }
}

function required(value: unknown, error: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(error);
  return value.trim();
}
