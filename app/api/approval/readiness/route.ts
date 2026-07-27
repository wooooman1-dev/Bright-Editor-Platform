import { NextResponse } from "next/server";

import type { UserData } from "../../../user-flow/user-data";
import { ApprovalReadinessApplicationService } from "../../../application/approval/ApprovalReadinessApplicationService";
import { connectionRepository } from "../../../application/connections/connection-runtime";
import { resolveTistoryConnectionId } from "../../../application/publishing/TistoryConnectionSelection";
import { studioStore } from "../../../application/studio-store";

const collection = "application";
const stateId = "user-data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      contentId?: string;
    };
    const workspaceId = required(body.workspaceId, "Workspace가 필요합니다.");
    const contentId = required(body.contentId, "Content가 필요합니다.");
    const data = await studioStore.get<UserData>(collection, stateId);
    if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");

    const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId);
    if (!content) throw new Error("승인 준비 검사 대상 Content를 찾을 수 없습니다.");

    const connectionId = content.platform === "tistory" || content.publishingPreparation?.tistory
      ? resolveTistoryConnectionId(data, content)
      : undefined;
    const connection = connectionId ? await connectionRepository.findById(connectionId) : undefined;
    if (connection && connection.workspaceId !== workspaceId) throw new Error("발행 계정이 현재 Workspace에 속하지 않습니다.");

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
        verifiedSourceCount: result.evidence.verifiedSourceCount,
        rejectedSourceCount: result.evidence.rejectedSourceCount,
        reasons: result.evidence.reasons,
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
