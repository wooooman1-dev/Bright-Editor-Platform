import type { UserData } from "../../user-flow/user-data";

export function resolveTistoryConnectionId(
  data: UserData,
  content: UserData["contents"][number],
): string | undefined {
  const project = data.projects.find(
    (item) => item.id === content.projectId && item.workspaceId === content.workspaceId,
  );

  const resolved = content.publishingAccountId?.trim()
    || singleId(content.selectedPublishingAccountIds)
    || project?.strategy?.defaultPublishingAccountId?.trim()
    || singleId(project?.selectedPublishingAccountIds);

  if (resolved) hydrateTistoryPreparationFromProject(content, project, resolved);
  return resolved || undefined;
}

export function isConnectionSelectedForContent(
  data: UserData,
  content: UserData["contents"][number],
  connectionId: string,
): boolean {
  const project = data.projects.find(
    (item) => item.id === content.projectId && item.workspaceId === content.workspaceId,
  );
  return content.publishingAccountId === connectionId
    || content.selectedPublishingAccountIds?.includes(connectionId) === true
    || project?.strategy?.defaultPublishingAccountId === connectionId
    || project?.selectedPublishingAccountIds?.includes(connectionId) === true;
}

function hydrateTistoryPreparationFromProject(
  content: UserData["contents"][number],
  project: UserData["projects"][number] | undefined,
  connectionId: string,
): void {
  const existing = content.publishingPreparation?.tistory;
  if (existing?.publishingAccountId === connectionId) return;

  const fallback = project?.strategy?.defaultTistoryCategory;
  if (!fallback || fallback.publishingAccountId !== connectionId) return;

  const mutable = content as {
    publishingAccountId?: string;
    publishingPreparation?: {
      tistory?: {
        publishingAccountId: string;
        platformCategoryId: string | null;
        platformCategoryName: string | null;
        updatedAt: string;
      };
    };
  };

  mutable.publishingAccountId = mutable.publishingAccountId?.trim() || connectionId;
  mutable.publishingPreparation = {
    ...mutable.publishingPreparation,
    tistory: {
      publishingAccountId: connectionId,
      platformCategoryId: fallback.id,
      platformCategoryName: fallback.name,
      updatedAt: project?.updatedAt ?? new Date().toISOString(),
    },
  };
}

function singleId(values?: readonly string[]): string | undefined {
  const ids = uniqueIds(values);
  return ids.length === 1 ? ids[0] : undefined;
}

function uniqueIds(values?: readonly string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
