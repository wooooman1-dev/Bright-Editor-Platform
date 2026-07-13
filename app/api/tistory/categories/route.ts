import { NextResponse } from "next/server";

import { connectionRepository, targetRepository } from "../../../application/connections/connection-runtime";
import { TistoryCategoryApplicationService } from "../../../application/publishing/TistoryCategoryApplicationService";
import { isPlatformEnabled } from "../../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../../application/studio-store";
import type { UserData } from "../../../user-flow/user-data";
import { TistoryCategoryWorkflowError } from "../../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await ownedContext(required(url.searchParams.get("workspaceId")), required(url.searchParams.get("contentId")), required(url.searchParams.get("connectionId")));
    const result = await readCategories(context);
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { workspaceId?: string; contentId?: string; connectionId?: string; categoryId?: string | null };
    const context = await ownedContext(required(body.workspaceId), required(body.contentId), required(body.connectionId));
    const result = await readCategories(context);
    const categoryId = body.categoryId === null ? null : required(body.categoryId);
    const selected = categoryId === null ? undefined : result.categories.find((item) => item.id === categoryId);
    if (categoryId !== null && !selected) throw new Error("선택한 카테고리를 현재 Tistory 계정에서 찾을 수 없습니다.");
    const updatedAt = new Date().toISOString();
    const next: UserData = { ...context.data, contents: context.data.contents.map((content) => content.id === context.content.id ? {
      ...content,
      publishingPreparation: { ...content.publishingPreparation, tistory: { publishingAccountId: context.connection.id, platformCategoryId: categoryId, platformCategoryName: selected?.name ?? "카테고리 없음", updatedAt } },
    } : content) };
    await studioStore.set("application", "user-data", next);
    return NextResponse.json({ preparation: next.contents.find((item) => item.id === context.content.id)?.publishingPreparation?.tistory });
  } catch (error) { return failure(error); }
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
  const selectedTarget = (content.selectedPublishingAccountIds ?? project.selectedPublishingAccountIds ?? []).includes(connection.id) && targets.some((target) => target.platformConnectionId === connection.id);
  return { data, content, project, connection, selectedTarget };
}
function readCategories(context: Awaited<ReturnType<typeof ownedContext>>) { return new TistoryCategoryApplicationService().read({ workspaceId: context.data.workspace!.id, projectId: context.project.id, contentId: context.content.id, connection: context.connection, selectedTarget: context.selectedTarget }); }
function required(value: unknown) { if (typeof value !== "string" || !value.trim()) throw new Error("필수 발행 준비 정보가 없습니다."); return value.trim(); }
function failure(error: unknown) {
  if (error instanceof TistoryCategoryWorkflowError) return NextResponse.json({ error: error.message, failureCode: error.code, safeMessage: error.message, remediation: error.remediation, reconnectRequired: error.code === "session_expired" }, { status: 400 });
  const message = error instanceof Error ? error.message : "카테고리를 불러오지 못했습니다.";
  return NextResponse.json({ error: message, safeMessage: message, reconnectRequired: message === "재연결 필요" }, { status: 400 });
}
