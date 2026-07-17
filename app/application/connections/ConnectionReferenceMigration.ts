import type { PlatformConnection, PublishingTarget } from "../../../core/connections";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";

export type ConnectionReferenceMigrationResult = Readonly<{
  data: UserData;
  affectedProjectIds: readonly string[];
  affectedContentIds: readonly string[];
}>;

export function assertCompatibleConnectionReplacement(
  source: PlatformConnection,
  replacement: PlatformConnection,
): void {
  if (source.id === replacement.id) throw new Error("Choose a different replacement account.");
  if (source.workspaceId !== replacement.workspaceId) throw new Error("Replacement account must belong to the same Workspace.");
  if (source.platform !== replacement.platform) throw new Error("Replacement account must use the same platform.");
  if (source.status !== "disconnected") throw new Error("Disconnect the old account before moving references.");
  if (replacement.status !== "connected") throw new Error("Replacement account must be connected.");

  const sourceIdentity = connectionIdentity(source);
  const replacementIdentity = connectionIdentity(replacement);
  if (!sourceIdentity || sourceIdentity !== replacementIdentity) {
    throw new Error("Replacement account must point to the same publishing site.");
  }
}

export function migrateConnectionReferences(
  data: UserData,
  sourceConnectionId: string,
  replacementConnectionId: string,
  updatedAt: string,
): ConnectionReferenceMigrationResult {
  const affectedProjectIds: string[] = [];
  const affectedContentIds: string[] = [];

  const projects = data.projects.map((project) => {
    const migrated = migrateProject(project, sourceConnectionId, replacementConnectionId, updatedAt);
    if (migrated !== project) affectedProjectIds.push(project.id);
    return migrated;
  });

  const contents = data.contents.map((content) => {
    const migrated = migrateContent(content, sourceConnectionId, replacementConnectionId, updatedAt);
    if (migrated !== content) affectedContentIds.push(content.id);
    return migrated;
  });

  return Object.freeze({
    data: Object.freeze({ ...data, projects: Object.freeze(projects), contents: Object.freeze(contents) }),
    affectedProjectIds: Object.freeze(affectedProjectIds),
    affectedContentIds: Object.freeze(affectedContentIds),
  });
}

export function replacementPublishingTarget(
  projectId: string,
  replacement: PlatformConnection,
  selectedAt: string,
): PublishingTarget {
  return Object.freeze({
    projectId,
    platformConnectionId: replacement.id,
    platform: replacement.platform,
    selectedAt,
  });
}

function migrateProject(
  project: UserProject,
  sourceConnectionId: string,
  replacementConnectionId: string,
  updatedAt: string,
): UserProject {
  const selectedPublishingAccountIds = replaceIds(
    project.selectedPublishingAccountIds,
    sourceConnectionId,
    replacementConnectionId,
  );
  const strategy = project.strategy;
  const nextStrategy = strategy
    ? {
      ...strategy,
      ...(strategy.defaultPublishingAccountId === sourceConnectionId
        ? { defaultPublishingAccountId: replacementConnectionId }
        : {}),
      ...(strategy.defaultTistoryCategory?.publishingAccountId === sourceConnectionId
        ? {
          defaultTistoryCategory: {
            ...strategy.defaultTistoryCategory,
            publishingAccountId: replacementConnectionId,
          },
        }
        : {}),
    }
    : undefined;

  const changed = selectedPublishingAccountIds !== project.selectedPublishingAccountIds
    || nextStrategy?.defaultPublishingAccountId !== strategy?.defaultPublishingAccountId
    || nextStrategy?.defaultTistoryCategory?.publishingAccountId !== strategy?.defaultTistoryCategory?.publishingAccountId;

  if (!changed) return project;
  return Object.freeze({
    ...project,
    selectedPublishingAccountIds,
    ...(nextStrategy ? { strategy: Object.freeze(nextStrategy) } : {}),
    updatedAt,
  });
}

function migrateContent(
  content: UserContent,
  sourceConnectionId: string,
  replacementConnectionId: string,
  updatedAt: string,
): UserContent {
  const selectedPublishingAccountIds = replaceIds(
    content.selectedPublishingAccountIds,
    sourceConnectionId,
    replacementConnectionId,
  );
  const publishingAccountId = content.publishingAccountId === sourceConnectionId
    ? replacementConnectionId
    : content.publishingAccountId;
  const tistory = content.publishingPreparation?.tistory;
  const nextTistory = tistory?.publishingAccountId === sourceConnectionId
    ? Object.freeze({ ...tistory, publishingAccountId: replacementConnectionId, updatedAt })
    : tistory;

  const changed = selectedPublishingAccountIds !== content.selectedPublishingAccountIds
    || publishingAccountId !== content.publishingAccountId
    || nextTistory !== tistory;

  if (!changed) return content;
  return Object.freeze({
    ...content,
    selectedPublishingAccountIds,
    ...(publishingAccountId ? { publishingAccountId } : {}),
    ...(content.publishingPreparation || nextTistory
      ? {
        publishingPreparation: Object.freeze({
          ...(content.publishingPreparation ?? {}),
          ...(nextTistory ? { tistory: nextTistory } : {}),
        }),
      }
      : {}),
    updatedAt,
  });
}

function replaceIds(
  ids: readonly string[] | undefined,
  sourceConnectionId: string,
  replacementConnectionId: string,
): readonly string[] | undefined {
  if (!ids?.includes(sourceConnectionId)) return ids;
  return Object.freeze([...new Set(ids.map((id) => id === sourceConnectionId ? replacementConnectionId : id))]);
}

function connectionIdentity(connection: PlatformConnection): string {
  if (connection.platform === "tistory") {
    return String(connection.publicMetadata.blogId ?? "").trim().toLocaleLowerCase("en-US");
  }
  return String(connection.publicMetadata.siteUrl ?? "").trim().replace(/\/$/u, "").toLocaleLowerCase("en-US");
}
