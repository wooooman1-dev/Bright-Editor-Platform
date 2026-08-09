import type { UserContent, UserData } from "../../user-flow/user-data";

export function isPublishingConnectionSelectedForContent(
  data: UserData,
  content: UserContent,
  connectionId: string,
): boolean {
  const project = data.projects.find((item) =>
    item.id === content.projectId
    && item.workspaceId === content.workspaceId);
  return content.publishingAccountId === connectionId
    || content.selectedPublishingAccountIds?.includes(connectionId) === true
    || project?.strategy?.defaultPublishingAccountId === connectionId
    || project?.selectedPublishingAccountIds?.includes(connectionId) === true;
}
