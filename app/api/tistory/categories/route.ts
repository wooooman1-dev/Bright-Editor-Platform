import { NextResponse } from "next/server";

import { connectionRepository, targetRepository } from "../../../application/connections/connection-runtime";
import { TistoryCategoryApplicationService } from "../../../application/publishing/TistoryCategoryApplicationService";
import {
  applyTistoryPublishingCategory,
  resolveTistoryDefaultCategory,
} from "../../../application/publishing/TistoryPublishingPreparation";
import { isPlatformEnabled } from "../../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../../application/studio-store";
import type { UserData } from "../../../user-flow/user-data";
import { TistoryCategoryWorkflowError } from "../../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";

export async function GET(request: Request) {
  const connectionId = new URL(request.url).searchParams.get("connectionId") ?? undefined;
  try {
    const url = new URL(request.url);
    const context = await ownedContext(required(url.searchParams.get("workspaceId")), required(url.searchParams.get("contentId")), required(url.searchParams.get("connectionId")));
    const result = await readCategories(context);
    const preparation = context.content.publishingPreparation?.tistory?.publishingAccountId === context.connection.id
      ? context.content.publishingPreparation.tistory
      : null;
    const proposed = preparation
      ? undefined
      : resolveTistoryDefaultCategory(context.project, context.connection.id, result.categories);
    return NextResponse.json({
      ...result,
      preparation,
      selection: preparation
        ? { source: "content", categoryId: preparation.platformCategoryId, categoryName: preparation.platformCategoryName }
        : proposed
          ? { source: "project", categoryId: proposed.id, categoryName: proposed.name }
          : null,
      ...(result.stale ? { safeMessage: "카테고리 목록을 새로 불러오지 못했습니다. 마지막으로 확인된 카테고리를 표시합니다." } : {}),
    });
  } catch (error) { return failure(error, connectionId); }
}

export async function POST(request: Request) {
  let connectionId: string | undefined;
  try {
    const body = await request.json() as { workspaceId?: string; contentId?: string; connectionId?: string; categoryId?: string | null };
    connectionId = body.connectionId;
    const context = await ownedContext(required(body.workspaceId), required(body.contentId), required(body.connectionId));
    const categoryId = body.categoryId === null ? null : required(body.categoryId);
    const result = categoryId === null ? undefined : await readCategories(context);
    const selected = categoryId === null ? undefined : result?.categories.find((item) => String(item.id) === String(categoryId));
    if (categoryId !== null && !selected) throw new Error("선택한 카테고리를 현재 Tistory 계정에서 찾을 수 없습니다.");
    const next = await studioStore.update<UserData>("application", "user-data", (current) => {
      const fresh = currentData(current, context.data.workspace!.id, context.content.id, context.project.id);
      return applyTistoryPublishingCategory(
        fresh,
        context.project.id,
        context.content.id,
        context.connection.id,
        { id: categoryId, name: selected?.name ?? null },
        new Date().toISOString(),
      );
    });
    return NextResponse.json({ preparation: next.contents.find((item) => item.id === context.content.id)?.publishingPreparation?.tistory, data: next });
  } catch (error) { return failure(error, connectionId); }
}

async function ownedContext(workspaceId: string, contentId: string, connectionId: string) {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("Workspace를 찾을 수 없습니다.");
  if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory가 Workspace 설정에서 비활성화되어 있습니다.");
  const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId);
  const project = content ? data.projects.find((item) => item.id === content.projectId && item.workspaceId === workspaceId) : undefined;
  const connection = await connectionRepository.findById(connectionId);
  if (!content || !project || !connection || connection.workspaceId !== workspaceId) throw new Error("발행 준비 대상을 찾을 수 없습니다.");
  if (connection.status !== "connected") throw new Error(connection.status === "expired" ? "재연결 필요" : "연결되고 확인된 Tistory 계정이 필요합니다.");
  const targets = targetRepository.listByProject ? await targetRepository.listByProject(project.id) : [];
  const selectedTarget = Boolean((content.selectedPublishingAccountIds?.includes(connection.id) || project.selectedPublishingAccountIds?.includes(connection.id) || content.publishingAccountId === connection.id) && targets.some((target) => target.platformConnectionId === connection.id));
  return { data, content, project, connection, selectedTarget };
}
function readCategories(context: Awaited<ReturnType<typeof ownedContext>>) { return new TistoryCategoryApplicationService().read({ workspaceId: context.data.workspace!.id, projectId: context.project.id, contentId: context.content.id, connection: context.connection, selectedTarget: context.selectedTarget }); }
function currentData(data: UserData | undefined, workspaceId: string, contentId: string, projectId: string): UserData {
  if (!data?.workspace || data.workspace.id !== workspaceId || !data.contents.some((item) => item.id === contentId) || !data.projects.some((item) => item.id === projectId)) throw new Error("발행 준비 대상을 다시 확인해 주세요.");
  return data;
}
function required(value: unknown) { if (typeof value !== "string" || !value.trim()) throw new Error("필수 발행 준비 정보가 없습니다."); return value.trim(); }
async function failure(error: unknown, connectionId?: string) {
  if (error instanceof TistoryCategoryWorkflowError) {
    if (error.code === "session_expired" && connectionId) {
      const connection = await connectionRepository.findById(connectionId);
      if (connection) await connectionRepository.save({ ...connection, status: "expired", publicMetadata: { ...connection.publicMetadata, sessionStateAvailable: false }, updatedAt: new Date().toISOString() });
    }
    return NextResponse.json({ error: error.message, state: categoryState(error.code), failureCode: error.code, safeMessage: error.message, remediation: error.remediation, reconnectRequired: error.code === "session_expired" }, { status: 400 });
  }
  if (error instanceof Error && error.message.startsWith("Bright Studio data could not be saved safely")) {
    console.error("[studio-persistence] category save failed", { code: persistenceDetail(error.message, 1), operation: persistenceDetail(error.message, 2) });
    return NextResponse.json({ error: "카테고리를 저장하지 못했습니다. 다시 시도해 주세요.", state: "persistence_error", safeMessage: "카테고리를 저장하지 못했습니다. 다시 시도해 주세요.", reconnectRequired: false }, { status: 500 });
  }
  const message = error instanceof Error ? error.message : "카테고리를 불러오지 못했습니다.";
  return NextResponse.json({ error: safeCategoryMessage(message), state: categoryStateFromMessage(message), safeMessage: safeCategoryMessage(message), reconnectRequired: message === "재연결 필요" }, { status: 400 });
}
function categoryState(code: TistoryCategoryWorkflowError["code"]) { return code === "session_expired" ? "session_expired" : code === "selector_error" ? "selector_error" : code === "worker_not_registered" || code === "browser_launch_failed" ? "worker_unavailable" : code === "connection_error" ? "connection_error" : "unknown_error"; }
function categoryStateFromMessage(message: string) { return message === "재연결 필요" ? "session_expired" : /permission|allow|허용|권한/i.test(message) ? "permission_denied" : "unknown_error"; }
function safeCategoryMessage(message: string) { return /permission|allow|허용|권한/i.test(message) ? "이 계정에는 카테고리 조회 권한이 없습니다." : message === "재연결 필요" ? "Tistory 로그인 세션이 만료되었습니다." : "카테고리 목록을 불러오지 못했습니다."; }
function persistenceDetail(message: string, index: number): string {
  const match = message.match(/\(([^ ]+) during ([^)]+)\)/);
  return match?.[index] ?? "UNKNOWN";
}
