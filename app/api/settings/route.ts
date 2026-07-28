import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import type { PlatformConnection } from "../../../core/connections";
import type { UserData, WorkspacePlatform } from "../../user-flow/user-data";
import { LocalSafeBackupWriter } from "../../application/SafeDeletionService";
import { connectionJobRunner, connectionRepository, connectionRoot } from "../../application/connections/connection-runtime";
import {
  publicConnectionRuntimeState,
  type PublicConnectionRuntimeState,
} from "../../application/connections/ConnectionPublicState";
import {
  aiProviderStatus, automationStatus, connectionSummary, resolveWorkspaceSettings,
  updateAppearance, updateEnabledPlatforms, updatePublishingPolicy, updateWorkspaceName,
} from "../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../application/studio-store";

const collection = "application", stateId = "user-data";

export async function GET(request: Request) {
  try {
    const workspaceId = required(new URL(request.url).searchParams.get("workspaceId"), "워크스페이스가 필요합니다.");
    const data = await ownedWorkspace(workspaceId);
    return NextResponse.json(await snapshot(data));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = required(body.workspaceId, "워크스페이스가 필요합니다.");
    const data = await ownedWorkspace(workspaceId);
    if (body.action === "rename-workspace") {
      const next = updateWorkspaceName(data, required(body.name, "워크스페이스 이름을 입력해 주세요."));
      await studioStore.set(collection, stateId, next); return NextResponse.json(await snapshot(next));
    }
    if (body.action === "save-publishing") {
      if (typeof body.sequentialDraftSave !== "boolean") throw new Error("임시저장 방식을 확인해 주세요.");
      const next = updatePublishingPolicy(data, body.sequentialDraftSave);
      await studioStore.set(collection, stateId, next); return NextResponse.json(await snapshot(next));
    }
    if (body.action === "save-enabled-platforms") {
      const next = updateEnabledPlatforms(data, body.enabledPlatforms);
      await studioStore.set(collection, stateId, next); return NextResponse.json(await snapshot(next));
    }
    if (body.action === "complete-platform-onboarding") {
      if (!Array.isArray(body.enabledPlatforms) || body.enabledPlatforms.length === 0) throw new Error("Select at least one platform to continue.");
      const next = updateEnabledPlatforms(data, body.enabledPlatforms);
      await studioStore.set(collection, stateId, next); return NextResponse.json(await snapshot(next));
    }
    if (body.action === "save-appearance") {
      const next = updateAppearance(data, body.theme);
      await studioStore.set(collection, stateId, next); return NextResponse.json(await snapshot(next));
    }
    if (body.action === "create-backup") {
      const connections = await connectionRepository.listByWorkspace(workspaceId);
      const file = await new LocalSafeBackupWriter().write("workspace", workspaceId, { userData: data, connections: connections.map(safeConnection) });
      return NextResponse.json({ backupCreated: true, backupName: path.basename(file), createdAt: new Date().toISOString() });
    }
    if (body.action === "check-ai") return NextResponse.json({ ai: aiProviderStatus() });
    if (body.action === "check-automation") return NextResponse.json({ automation: await automationStatus() });
    throw new Error("지원하지 않는 설정 작업입니다.");
  } catch (error) { return failure(error); }
}

async function snapshot(data: UserData) {
  const workspace = data.workspace!;
  const storedConnections = await connectionRepository.listByWorkspace(workspace.id);
  const runtimeConnections = await Promise.all(storedConnections.map((connection) => resolveConnectionRuntime(connection, data)));
  const effectiveConnections = runtimeConnections.map(({ connection, runtime }) => ({
    ...connection,
    status: runtime.status,
    publicMetadata: {
      ...connection.publicMetadata,
      sessionStateAvailable: runtime.sessionStateAvailable,
    },
  } satisfies PlatformConnection));
  const settings = resolveWorkspaceSettings(data);
  const enabledRuntimeConnections = runtimeConnections.filter(({ connection }) => settings.enabledPlatforms.includes(connection.platform));
  const [automation, backup] = await Promise.all([automationStatus(), latestBackup(workspace.id)]);
  const platformStatus = Object.fromEntries(settings.enabledPlatforms.map((platform) => [platform, platformSummary(platform, effectiveConnections)]));
  return {
    workspace: { id: workspace.id, name: workspace.name, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt, projectCount: data.projects.length, contentCount: data.contents.length, publishingAccountCount: storedConnections.length },
    settings,
    ai: aiProviderStatus(),
    platforms: platformStatus,
    connections: enabledRuntimeConnections.map(({ connection, runtime, activeJobId }) => publicConnection(connection, runtime, activeJobId)),
    automation: { ...automation, tistorySessionReady: settings.enabledPlatforms.includes("tistory") && enabledRuntimeConnections.some(({ connection, runtime }) => connection.platform === "tistory" && runtime.status === "connected" && runtime.sessionStateAvailable) },
    backup,
    persistence: { status: "ready", message: "로컬 데이터 저장소를 정상적으로 읽었습니다." },
    publishing: { status: "ready", message: "검토 후 임시저장 정책이 서버에서 적용됩니다." },
    projects: data.projects.map((project) => ({ id: project.id, name: project.name })),
  };
}

async function resolveConnectionRuntime(connection: PlatformConnection, data: UserData) {
  const storedSessionExists = connection.platform !== "tistory" || await tistorySessionExists(connection.id);
  const activeJob = connection.platform === "tistory" ? connectionJobRunner.statusByConnection(connection.id) : undefined;
  return {
    connection,
    runtime: publicConnectionRuntimeState(connection, data, storedSessionExists, Boolean(activeJob)),
    activeJobId: activeJob?.id,
  };
}

async function tistorySessionExists(connectionId: string): Promise<boolean> {
  try {
    await access(path.join(connectionRoot, "tistory", connectionId, "storage-state.json"));
    return true;
  } catch {
    return false;
  }
}

function platformSummary(platform: WorkspacePlatform, connections: readonly PlatformConnection[]) {
  if (platform === "tistory" || platform === "wordpress") return connectionSummary(connections, platform);
  return { status: "not_supported" as const, accountCount: 0, connectedCount: 0 };
}

async function ownedWorkspace(workspaceId: string): Promise<UserData> {
  const data = await studioStore.get<UserData>(collection, stateId);
  if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("워크스페이스를 찾을 수 없습니다.");
  return data;
}

async function latestBackup(workspaceId: string) {
  const root = path.join(process.cwd(), ".bright-studio", "backups");
  try {
    const names = (await readdir(root)).filter((name) => name.startsWith(`v1-workspace-${safeName(workspaceId)}-`) && name.endsWith(".json"));
    const entries = await Promise.all(names.map(async (name) => ({ name, modifiedAt: (await stat(path.join(root, name))).mtime.toISOString() })));
    return entries.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt)).at(-1) ?? { status: "configuration_required", message: "아직 생성된 워크스페이스 백업이 없습니다." };
  } catch { return { status: "configuration_required", message: "아직 생성된 워크스페이스 백업이 없습니다." }; }
}

function publicConnection(connection: PlatformConnection, runtime: PublicConnectionRuntimeState, activeJobId?: string) {
  return {
    id: connection.id,
    platform: connection.platform,
    displayName: connection.displayName,
    status: runtime.status,
    lastVerifiedAt: connection.lastVerifiedAt,
    updatedAt: connection.updatedAt,
    permissions: connection.automationPermissions ?? [],
    publishingPolicy: connection.publishingPolicy ?? "review_first",
    publicMetadata: safePublicMetadata(connection, runtime),
    projectReferenceCount: runtime.projectReferenceCount,
    contentReferenceCount: runtime.contentReferenceCount,
    ...(activeJobId ? { activeJobId } : {}),
  };
}

function safePublicMetadata(connection: PlatformConnection, runtime?: PublicConnectionRuntimeState) {
  const value = connection.publicMetadata;
  return connection.platform === "tistory"
    ? {
        blogId: value.blogId,
        blogUrl: value.blogUrl,
        sessionStateAvailable: runtime?.sessionStateAvailable ?? value.sessionStateAvailable === true,
        safeError: value.safeError,
      }
    : { siteUrl: value.siteUrl, siteTitle: value.siteTitle, username: value.username, safeError: value.safeError };
}
function safeConnection(connection: PlatformConnection) { return { ...publicConnection(connection, publicConnectionRuntimeState(connection, { workspace: undefined, brands: [], projects: [], contents: [] }, connection.platform !== "tistory" || connection.publicMetadata.sessionStateAvailable === true)), workspaceId: connection.workspaceId }; }
function safeName(value: string) { return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60); }
function required(value: unknown, error: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(error); return value.trim(); }
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? safeError(error.message) : "설정을 처리하지 못했습니다." }, { status: 400 }); }
function safeError(value: string) { return value.replace(/[A-Z]:\\[^\s]+/gi, "로컬 데이터").slice(0, 240); }
