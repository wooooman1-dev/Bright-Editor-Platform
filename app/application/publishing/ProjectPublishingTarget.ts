import {
  resolveProjectStrategy,
  type UserData,
  type WorkspacePlatform,
} from "../../user-flow/user-data";
import type { PlatformConnection, Platform } from "../../../core/connections";

export type ProjectPublishingTargetConnection = Readonly<{
  id: string;
  platform: WorkspacePlatform;
}>;

export function resolveCanonicalPublishingConnection(
  data: UserData,
  content: UserData["contents"][number],
  connections: readonly PlatformConnection[],
): PlatformConnection | undefined {
  const project = data.projects.find((item) =>
    item.id === content.projectId
    && item.workspaceId === content.workspaceId);
  if (!project) return undefined;

  const platform = canonicalContentPlatform(project, content);
  if (!platform) return undefined;
  const available = connections.filter((connection) =>
    connection.workspaceId === content.workspaceId
    && connection.platform === platform);
  const byId = (id: string | undefined) => id
    ? available.find((connection) => connection.id === id.trim())
    : undefined;

  const preparedId = platform === "wordpress"
    ? content.publishingPreparation?.wordpress?.publishingAccountId
    : content.publishingPreparation?.tistory?.publishingAccountId;
  return byId(preparedId)
    ?? byId(content.publishingAccountId)
    ?? singleConnection(content.selectedPublishingAccountIds, available)
    ?? byId(resolveProjectStrategy(project).defaultPublishingAccountId)
    ?? singleConnection(project.selectedPublishingAccountIds, available);
}

export function applyProjectPublishingTargets(
  data: UserData,
  projectId: string,
  accountIds: readonly string[],
  connections: readonly ProjectPublishingTargetConnection[],
  updatedAt: string,
): UserData {
  const selectedPublishingAccountIds = [...new Set(accountIds)];
  const singleTarget = selectedPublishingAccountIds.length === 1
    ? connections.find((connection) => connection.id === selectedPublishingAccountIds[0])
    : undefined;

  return {
    ...data,
    projects: data.projects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        selectedPublishingAccountIds,
        ...(singleTarget ? {
          strategy: {
            ...resolveProjectStrategy(project),
            defaultPlatform: singleTarget.platform,
            defaultPublishingAccountId: singleTarget.id,
          },
        } : {}),
        updatedAt,
      };
    }),
  };
}

export function projectPublishingAccountIds(
  data: UserData,
  projectId: string,
  accountIds: readonly string[],
  connections: readonly ProjectPublishingTargetConnection[],
  platform: WorkspacePlatform,
): readonly string[] {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || resolveProjectStrategy(project).defaultPlatform !== platform) return Object.freeze([]);
  return Object.freeze(accountIds.filter((accountId) => connections.some(
    (connection) => connection.id === accountId && connection.platform === platform,
  )));
}

function canonicalContentPlatform(
  project: UserData["projects"][number],
  content: UserData["contents"][number],
): Platform | undefined {
  const hasTistoryPreparation = Boolean(content.publishingPreparation?.tistory);
  const hasWordPressPreparation = Boolean(content.publishingPreparation?.wordpress);
  if (hasTistoryPreparation !== hasWordPressPreparation) {
    return hasWordPressPreparation ? "wordpress" : "tistory";
  }
  if (content.platform === "tistory" || content.platform === "wordpress") return content.platform;
  const projectPlatform = resolveProjectStrategy(project).defaultPlatform;
  return projectPlatform === "tistory" || projectPlatform === "wordpress" ? projectPlatform : undefined;
}

function singleConnection(
  ids: readonly string[] | undefined,
  connections: readonly PlatformConnection[],
): PlatformConnection | undefined {
  const selected = [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))]
    .flatMap((id) => connections.find((connection) => connection.id === id) ?? []);
  return selected.length === 1 ? selected[0] : undefined;
}
