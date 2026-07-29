import {
  resolveProjectStrategy,
  type UserData,
  type WorkspacePlatform,
} from "../../user-flow/user-data";

export type ProjectPublishingTargetConnection = Readonly<{
  id: string;
  platform: WorkspacePlatform;
}>;

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
