import { NextResponse } from "next/server";

import { connectionRepository, targetRepository } from "../../../application/connections/connection-runtime";
import { TistoryPostCatalogApplicationService } from "../../../application/publishing/TistoryPostCatalogApplicationService";
import { isPlatformEnabled } from "../../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../../application/studio-store";
import type { UserData } from "../../../user-flow/user-data";
import { rankRelatedPosts } from "../../../../core/content";
import { TistoryPostWorkflowError } from "../../../../apps/tistory/workflows/TistoryPostReadWorkflow";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const workspaceId = required(url.searchParams.get("workspaceId")); const contentId = required(url.searchParams.get("contentId")); const connectionId = required(url.searchParams.get("connectionId"));
    const data = await studioStore.get<UserData>("application", "user-data");
    if (!data?.workspace || data.workspace.id !== workspaceId || !isPlatformEnabled(data, "tistory")) throw new Error("Workspace 또는 Tistory 설정을 찾을 수 없습니다.");
    const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId); const project = content ? data.projects.find((item) => item.id === content.projectId && item.workspaceId === workspaceId) : undefined; const connection = await connectionRepository.findById(connectionId);
    if (!content || !project || !connection || connection.workspaceId !== workspaceId) throw new Error("게시글 조회 대상을 찾을 수 없습니다.");
    const targets = targetRepository.listByProject ? await targetRepository.listByProject(project.id) : []; const selectedTarget = Boolean((content.selectedPublishingAccountIds?.includes(connection.id) || project.selectedPublishingAccountIds?.includes(connection.id) || content.publishingAccountId === connection.id) && targets.some((target) => target.platformConnectionId === connection.id));
    const result = await new TistoryPostCatalogApplicationService().read({ workspaceId, projectId: project.id, contentId, connection, selectedTarget, refresh: url.searchParams.get("refresh") === "true" });
    const eligible = result.posts.filter((post) => !content.publishedUrl || post.publishedUrl !== content.publishedUrl);
    const posts = content.document ? rankRelatedPosts(content.document, eligible, { primaryKeyword: content.primaryKeyword, categoryName: content.publishingPreparation?.tistory?.platformCategoryName ?? undefined }) : eligible;
    return NextResponse.json({ ...result, posts });
  } catch (error) {
    if (error instanceof TistoryPostWorkflowError) return NextResponse.json({ state: error.code, error: error.message, remediation: error.remediation }, { status: 400 });
    const message = error instanceof Error ? error.message : "게시글을 불러오지 못했습니다."; return NextResponse.json({ state: /permission|allow/i.test(message) ? "permission_denied" : message === "재연결 필요" ? "session_expired" : "connection_error", error: message }, { status: 400 });
  }
}
function required(value: unknown) { if (typeof value !== "string" || !value.trim()) throw new Error("필수 게시글 조회 정보가 없습니다."); return value.trim(); }
