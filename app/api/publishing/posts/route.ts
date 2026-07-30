import { NextResponse } from "next/server";

import { TistoryPostWorkflowError } from "../../../../apps/tistory/workflows/TistoryPostReadWorkflow";
import { connectionRepository, targetRepository } from "../../../application/connections/connection-runtime";
import {
  publishingCategoryIdentities,
  rankPublishingPostCandidates,
} from "../../../application/publishing/InternalLinkCatalogPolicy";
import { PublicPostCatalogApplicationService } from "../../../application/publishing/PublicPostCatalogApplicationService";
import { resolveCanonicalPublishingConnection } from "../../../application/publishing/ProjectPublishingTarget";
import { isPublishingConnectionSelectedForContent } from "../../../application/publishing/PublishingTargetSelection";
import { isPlatformEnabled } from "../../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../../application/studio-store";
import type { UserData } from "../../../user-flow/user-data";

export async function GET(request: Request) {
  let connectionId: string | undefined;
  try {
    const url = new URL(request.url);
    const workspaceId = required(url.searchParams.get("workspaceId"));
    const contentId = required(url.searchParams.get("contentId"));
    connectionId = required(url.searchParams.get("connectionId"));

    const data = await studioStore.get<UserData>("application", "user-data");
    if (!data?.workspace || data.workspace.id !== workspaceId) {
      throw new Error("Workspace를 찾을 수 없습니다.");
    }
    const content = data.contents.find((item) =>
      item.id === contentId && item.workspaceId === workspaceId);
    const project = content
      ? data.projects.find((item) =>
          item.id === content.projectId && item.workspaceId === workspaceId)
      : undefined;
    const connections = await connectionRepository.listByWorkspace(workspaceId);
    const canonical = content
      ? resolveCanonicalPublishingConnection(data, content, connections)
      : undefined;
    if (!content || !project || !canonical || canonical.id !== connectionId) {
      throw new Error("현재 Content의 공개 글 조회 대상을 찾을 수 없습니다.");
    }
    if (!isPlatformEnabled(data, canonical.platform)) {
      throw new Error(`${canonical.platform} 플랫폼이 Workspace Settings에서 비활성화되어 있습니다.`);
    }

    const categories = publishingCategoryIdentities(content);
    if (!categories.length) {
      return NextResponse.json({
        platform: canonical.platform,
        platformConnectionId: canonical.id,
        state: "empty",
        posts: [],
        retrievedAt: new Date().toISOString(),
        cached: false,
        diagnostic: "category_missing",
      });
    }

    const targets = targetRepository.listByProject
      ? await targetRepository.listByProject(project.id)
      : [];
    const selectedTarget = isPublishingConnectionSelectedForContent(
      data,
      content,
      canonical.id,
    ) && targets.some((target) =>
      target.platformConnectionId === canonical.id
      && target.platform === canonical.platform);

    const result = await new PublicPostCatalogApplicationService().read({
      workspaceId,
      projectId: project.id,
      contentId,
      content,
      connection: canonical,
      selectedTarget,
      refresh: url.searchParams.get("refresh") === "true",
    });
    const eligible = result.posts.filter((post) =>
      !content.publishedUrl || post.publishedUrl !== content.publishedUrl);
    const posts = content.document
      ? rankPublishingPostCandidates(content.document, eligible, content)
      : eligible;

    return NextResponse.json({
      ...result,
      state: posts.length ? "success" : "empty",
      posts,
    });
  } catch (error) {
    if (error instanceof TistoryPostWorkflowError) {
      if (error.code === "session_expired" && connectionId) {
        await markTistorySessionExpired(connectionId);
      }
      return NextResponse.json({
        state: error.code,
        error: error.message,
        remediation: error.remediation,
        reconnectRequired: error.code === "session_expired",
      }, { status: 400 });
    }

    const detail =
      error instanceof Error ? error.message : "게시글을 불러오지 못했습니다.";
    if ((detail === "재연결 필요" || detail === "WordPress reconnect is required.")
      && connectionId) {
      await markConnectionVerificationRequired(connectionId, detail);
    }
    return NextResponse.json({
      state: /permission|allow/i.test(detail)
        ? "permission_denied"
        : /reconnect|재연결/i.test(detail)
          ? "session_expired"
          : "connection_error",
      error: detail,
      reconnectRequired: /reconnect|재연결/i.test(detail),
    }, { status: 400 });
  }
}

async function markTistorySessionExpired(connectionId: string): Promise<void> {
  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.platform !== "tistory") return;
  await connectionRepository.save({
    ...connection,
    status: "expired",
    updatedAt: new Date().toISOString(),
    publicMetadata: {
      ...connection.publicMetadata,
      sessionStateAvailable: false,
      safeError: "Tistory 로그인 세션이 만료되었습니다. 다시 연결해 주세요.",
    },
  });
}

async function markConnectionVerificationRequired(
  connectionId: string,
  detail: string,
): Promise<void> {
  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.platform !== "wordpress") return;
  await connectionRepository.save({
    ...connection,
    status: "verification_required",
    updatedAt: new Date().toISOString(),
    publicMetadata: {
      ...connection.publicMetadata,
      safeError: detail,
    },
  });
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("필수 게시글 조회 정보가 없습니다.");
  }
  return value.trim();
}
