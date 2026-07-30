import { NextResponse } from "next/server";

import type { UserData } from "../../../user-flow/user-data";
import { ApprovalReadinessApplicationService } from "../../../application/approval/ApprovalReadinessApplicationService";
import { WordPressManualSiteReviewApplicationService } from "../../../application/approval/WordPressManualSiteReviewApplicationService";
import { isWordPressManualSiteReviewKey } from "../../../../apps/wordpress/approval/WordPressManualSiteReview";
import { connectionRepository } from "../../../application/connections/connection-runtime";
import { resolveCanonicalPublishingConnection } from "../../../application/publishing/ProjectPublishingTarget";
import { studioStore } from "../../../application/studio-store";

const collection = "application";
const stateId = "user-data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string;
      workspaceId?: string;
      contentId?: string;
      key?: string;
      completed?: boolean;
    };
    const workspaceId = required(body.workspaceId, "Workspace가 필요합니다.");
    const contentId = required(body.contentId, "Content가 필요합니다.");
    const data = await studioStore.get<UserData>(collection, stateId);
    if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");

    const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId);
    if (!content) throw new Error("승인 준비 검사 대상 Content를 찾을 수 없습니다.");

    const connections = await connectionRepository.listByWorkspace(workspaceId);
    const connection = resolveCanonicalPublishingConnection(data, content, connections);

    const manualService = new WordPressManualSiteReviewApplicationService();
    let result;
    if (body.action === "set_wordpress_manual_site_review") {
      if (!connection || connection.platform !== "wordpress") {
        throw new Error("WordPress 연결을 찾을 수 없습니다.");
      }
      if (!body.key || !isWordPressManualSiteReviewKey(body.key)) {
        throw new Error("저장할 WordPress 수동 검토 항목이 올바르지 않습니다.");
      }
      result = manualService.execute({
        data,
        contentId,
        connection,
        key: body.key,
        completed: body.completed === true,
      });
    } else {
      const audited = await new ApprovalReadinessApplicationService().execute({
        data,
        contentId,
        connection,
      });
      result = connection?.platform === "wordpress"
        ? manualService.preserveAfterAudit({
            previousData: data,
            contentId,
            connection,
            result: audited,
          })
        : audited;
    }
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
