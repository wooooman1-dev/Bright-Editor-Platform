import type { PlatformConnection } from "../../../../core/connections";
import type { UserData } from "../../../user-flow/user-data";
import {
  connectionRepository,
  targetRepository,
} from "../../../application/connections/connection-runtime";
import {
  isPlatformEnabled,
  resolveWorkspaceSettings,
} from "../../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../../application/studio-store";

export type ScheduleProbeRequestBody = Readonly<{
  workspaceId?: string;
  projectId?: string;
  contentId?: string;
  connectionId?: string;
  connectionName?: string;
}>;

export type ScheduleProbeExecutionContext = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  connection: PlatformConnection;
  selectedTarget: boolean;
}>;

export async function resolveScheduleProbeContext(
  body: ScheduleProbeRequestBody,
): Promise<ScheduleProbeExecutionContext> {
  const workspaceId = required(body.workspaceId);
  const projectId = required(body.projectId);
  const contentId = required(body.contentId);
  const data = await ownedContext(workspaceId, projectId, contentId);
  const policy = resolveWorkspaceSettings(data);
  if (!policy.publishing.draftOnly || policy.publishing.publicPublish) {
    throw new Error("현재 Workspace의 안전한 Draft Only 정책에서만 예약 UI 조사를 실행할 수 있습니다.");
  }

  const connection = await resolveConnection(
    workspaceId,
    body.connectionId,
    body.connectionName,
  );
  if (connection.workspaceId !== workspaceId || connection.platform !== "tistory") {
    throw new Error("Tistory 예약 UI 조사 계정이 현재 Workspace와 일치하지 않습니다.");
  }

  const project = data.projects.find((item) => item.id === projectId)!;
  const content = data.contents.find((item) => item.id === contentId)!;
  const selectedTarget = await hasSelectedTarget(
    projectId,
    content,
    project,
    connection.id,
  );

  return Object.freeze({
    workspaceId,
    projectId,
    contentId,
    connection,
    selectedTarget,
  });
}

async function resolveConnection(
  workspaceId: string,
  connectionId?: string,
  connectionName?: string,
): Promise<PlatformConnection> {
  const requestedId = optional(connectionId);
  if (requestedId) {
    const connection = await connectionRepository.findById(requestedId);
    if (!connection) throw new Error("Tistory 발행 계정을 찾을 수 없습니다.");
    return connection;
  }

  const requestedName = optional(connectionName);
  if (!requestedName) {
    throw new Error("Tistory connectionId 또는 정확한 계정 이름이 필요합니다.");
  }
  const matches = (await connectionRepository.listByWorkspace(workspaceId)).filter(
    (connection) => connection.platform === "tistory"
      && connection.displayName === requestedName,
  );
  if (matches.length !== 1) {
    throw new Error("현재 Workspace에서 정확히 일치하는 Tistory 계정 한 개를 찾지 못했습니다.");
  }
  return matches[0];
}

async function ownedContext(
  workspaceId: string,
  projectId: string,
  contentId: string,
): Promise<UserData> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) {
    throw new Error("Workspace를 찾을 수 없습니다.");
  }
  if (!isPlatformEnabled(data, "tistory")) {
    throw new Error("Tistory is disabled in Workspace Settings.");
  }
  const project = data.projects.find(
    (item) => item.id === projectId && item.workspaceId === workspaceId,
  );
  const content = data.contents.find((item) => (
    item.id === contentId
      && item.projectId === projectId
      && (item.workspaceId === undefined || item.workspaceId === workspaceId)
  ));
  if (!project || !content) {
    throw new Error("Project 또는 Content를 찾을 수 없습니다.");
  }
  return data;
}

async function hasSelectedTarget(
  projectId: string,
  content: UserData["contents"][number],
  project: UserData["projects"][number],
  connectionId: string,
): Promise<boolean> {
  const targets = targetRepository.listByProject
    ? await targetRepository.listByProject(projectId)
    : [];
  const selected = content.selectedPublishingAccountIds?.includes(connectionId)
    || project.selectedPublishingAccountIds?.includes(connectionId)
    || content.publishingAccountId === connectionId;
  return Boolean(
    selected
      && targets.some(
        (target) => target.platformConnectionId === connectionId,
      ),
  );
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Required schedule UI probe context is missing.");
  }
  return value.trim();
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}
