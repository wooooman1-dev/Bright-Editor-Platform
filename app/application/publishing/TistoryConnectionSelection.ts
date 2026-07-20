import type { UserData } from "../../user-flow/user-data";

export function resolveTistoryConnectionId(
  data: UserData,
  content: UserData["contents"][number],
): string | undefined {
  if (content.publishingAccountId?.trim()) return content.publishingAccountId.trim();

  const contentSelected = uniqueIds(content.selectedPublishingAccountIds);
  if (contentSelected.length === 1) return contentSelected[0];

  const project = data.projects.find(
    (item) => item.id === content.projectId && item.workspaceId === content.workspaceId,
  );
  if (!project) return undefined;

  const defaultConnectionId = project.strategy?.defaultPublishingAccountId?.trim();
  if (defaultConnectionId) return defaultConnectionId;

  const projectSelected = uniqueIds(project.selectedPublishingAccountIds);
  return projectSelected.length === 1 ? projectSelected[0] : undefined;
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

function uniqueIds(values?: readonly string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
