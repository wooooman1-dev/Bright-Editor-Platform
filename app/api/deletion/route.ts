import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import type { PlatformConnection } from "../../../core/connections";
import type { UserData } from "../../user-flow/user-data";
import {
  LocalSafeBackupWriter, calculateProjectImpact, calculateWorkspaceImpact,
  deleteWorkspaceData, executeProjectDeletion, ProjectDeletionError,
} from "../../application/SafeDeletionService";
import { connectionRepository, connectionRoot, secretStore, targetRepository } from "../../application/connections/connection-runtime";
import { studioStore } from "../../application/studio-store";

const collection = "application", stateId = "user-data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; workspaceId?: string; projectId?: string; confirmation?: string; finalConfirmation?: boolean };
    const data = await currentData();
    if (body.workspaceId !== data.workspace?.id) throw new Error("Workspace was not found.");
    const connections = await connectionRepository.listByWorkspace(data.workspace!.id);
    if (body.action === "project-impact") return NextResponse.json({ impact: calculateProjectImpact(data, required(body.projectId, "Project is required.")) });
    if (body.action === "workspace-impact") return NextResponse.json({ impact: calculateWorkspaceImpact(data, connections.length) });
    if (body.action === "delete-project") return deleteProject(data, required(body.projectId, "Project is required."), body.confirmation);
    if (body.action === "delete-workspace") return deleteWorkspace(data, connections, body.confirmation, body.finalConfirmation === true);
    throw new Error("Unsupported deletion action.");
  } catch (error) {
    if (error instanceof ProjectDeletionError) return NextResponse.json({ deleted: false, status: "cleanup_required", backupCreated: true, backupName: path.basename(error.backupPath), projectRestored: error.projectRestored, error: error.projectRestored ? "프로젝트 삭제를 완료하지 못했습니다. 기존 프로젝트는 유지되며 정리가 필요합니다." : "프로젝트 삭제를 완료하지 못했습니다. 백업은 보존되었으며 복구 확인이 필요합니다." }, { status: 409 });
    return NextResponse.json({ error: safeDeletionMessage(error) }, { status: 400 });
  }
}

async function deleteProject(data: UserData, projectId: string, confirmation?: string) {
  const impact = calculateProjectImpact(data, projectId);
  if (confirmation !== impact.name) throw new Error("Project name confirmation does not match exactly.");
  const { backupPath } = await executeProjectDeletion(data, projectId, new LocalSafeBackupWriter(), (next) => studioStore.set(collection, stateId, next), (id) => targetRepository.delete(id));
  return NextResponse.json({ deleted: true, backupCreated: true, backupName: path.basename(backupPath), nextRoute: `/workspaces/${data.workspace!.id}` });
}

async function deleteWorkspace(data: UserData, connections: readonly PlatformConnection[], confirmation?: string, finalConfirmation = false) {
  const impact = calculateWorkspaceImpact(data, connections.length);
  if (confirmation !== impact.name) throw new Error("Workspace name confirmation does not match exactly.");
  if (!finalConfirmation) throw new Error("Final Workspace deletion confirmation is required.");
  const backupPath = await new LocalSafeBackupWriter().write("workspace", data.workspace!.id, { userData: data, connections: connections.map(safeConnection) });
  try {
    for (const connection of connections) await cleanupConnection(connection);
  } catch (error) {
    return NextResponse.json({ deleted: false, status: "cleanup_required", backupCreated: true, backupName: path.basename(backupPath), error: message(error) }, { status: 409 });
  }
  for (const project of data.projects) await targetRepository.delete(project.id);
  for (const connection of connections) await connectionRepository.delete(connection.id);
  try { await studioStore.set(collection, stateId, deleteWorkspaceData()); }
  catch (error) { throw new Error(`Workspace metadata deletion failed after secret cleanup: ${message(error)}`); }
  return NextResponse.json({ deleted: true, status: "deleted", backupCreated: true, backupName: path.basename(backupPath), secretCleanup: "completed", nextRoute: "/" });
}

async function cleanupConnection(connection: PlatformConnection) {
  if (connection.platform === "wordpress" && connection.secretReference) await secretStore.deleteSecret(connection.secretReference);
  if (connection.platform === "tistory") await rm(path.join(connectionRoot, "tistory", connection.id), { recursive: true, force: true });
}
async function currentData(): Promise<UserData> { const data = await studioStore.get<UserData>(collection, stateId); if (!data?.workspace) throw new Error("Workspace was not found."); return data; }
function safeConnection(connection: PlatformConnection) { const { secretReference: _secret, ...safe } = connection; void _secret; return safe; }
function required(value: unknown, error: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(error); return value.trim(); }
function message(error: unknown): string { return error instanceof Error ? error.message : "Deletion failed."; }
function safeDeletionMessage(error: unknown): string {
  const value = message(error);
  if (value === "Project name confirmation does not match exactly.") return "프로젝트 이름이 정확히 일치하지 않습니다.";
  if (value === "Workspace name confirmation does not match exactly.") return "워크스페이스 이름이 정확히 일치하지 않습니다.";
  if (/not found|required/i.test(value)) return "삭제 대상을 확인하지 못했습니다.";
  return "삭제를 완료하지 못했습니다. 데이터는 유지됩니다. 다시 시도해 주세요.";
}
