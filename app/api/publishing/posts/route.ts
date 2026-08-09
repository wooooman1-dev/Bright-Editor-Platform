import { NextResponse } from "next/server";

import type { Platform } from "../../../../core/connections";
import { connectionRepository, targetRepository } from "../../../application/connections/connection-runtime";
import {
  publishingCategoryIdentities,
  rankPublishingPostCandidates,
} from "../../../application/publishing/InternalLinkCatalogPolicy";
import { PublicPostCatalogError } from "../../../application/publishing/PublicPostCatalogError";
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
      throw new Error("작업공간을 찾을 수 없습니다.");
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
      throw new Error("현재 콘텐츠의 공개 글 조회 대상을 찾을 수 없습니다.");
    }
    if (!isPlatformEnabled(data, canonical.platform)) {
      throw new Error(`${platformLabel(canonical.platform)} 플랫폼이 작업공간 설정에서 비활성화되어 있습니다.`);
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
    if (error instanceof PublicPostCatalogError) {
      if (error.reconnectRequired && connectionId) {
        await markConnectionVerificationRequired(
          connectionId,
          error.platform,
          error.message,
        );
      }
      return NextResponse.json({
        state: error.state,
        error: error.message,
        ...(error.remediation ? { remediation: error.remediation } : {}),
        reconnectRequired: error.reconnectRequired,
      }, { status: 400 });
    }

    const detail =
      error instanceof Error ? error.message : "게시글을 불러오지 못했습니다.";
    if (/reconnect|재연결/i.test(detail) && connectionId) {
      const connection = await connectionRepository.findById(connectionId);
      if (connection) {
        await markConnectionVerificationRequired(
          connectionId,
          connection.platform,
          detail,
        );
      }
    }
    return NextResponse.json({
      state: /permission|allow|권한/i.test(detail)
        ? "permission_denied"
        : /reconnect|재연결/i.test(detail)
          ? "session_expired"
          : "connection_error",
      error: detail,
      reconnectRequired: /reconnect|재연결/i.test(detail),
    }, { status: 400 });
  }
}

async function markConnectionVerificationRequired(
  connectionId: string,
  platform: Platform,
  detail: string,
): Promise<void> {
  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.platform !== platform) return;

  await connectionRepository.save({
    ...connection,
    status: platform === "tistory" ? "expired" : "verification_required",
    updatedAt: new Date().toISOString(),
    publicMetadata: {
      ...connection.publicMetadata,
      ...(platform === "tistory" ? { sessionStateAvailable: false } : {}),
      safeError: detail,
    },
  });
}

function platformLabel(platform: Platform): string {
  return platform === "wordpress" ? "워드프레스" : "티스토리";
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("필수 게시글 조회 정보가 없습니다.");
  }
  return value.trim();
}
