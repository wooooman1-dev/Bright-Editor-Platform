import { contentSummaryFixtures } from "../shared/fixtures/content";
import type { ContentSummary } from "../shared/view-models/content";
import type { ProjectSummary, WorkspaceSummary } from "../shared/view-models/workspace";
import { projectFixtures, workspaceFixtures } from "../workspaces/workspace-fixtures";

export type PublishChecklistItem = Readonly<{
  id: string;
  label: string;
  status: "ready" | "pending";
  detail: string;
}>;

export type PublishPreparationState = Readonly<{
  workspace: WorkspaceSummary;
  project: ProjectSummary;
  content: ContentSummary;
  readiness: "needs-connection";
  platform: Readonly<{
    name: "Not connected";
    status: "unavailable";
  }>;
  checklist: readonly PublishChecklistItem[];
}>;

export function getPublishPreparationState(workspaceId: string, projectId: string, contentId: string): PublishPreparationState | undefined {
  const workspace = workspaceFixtures.find((item) => item.id === workspaceId);
  if (!workspace || workspace.id !== workspaceId) return undefined;

  const project = projectFixtures.find((item) => item.id === projectId);
  if (!project || project.id !== projectId || project.workspaceId !== workspace.id) return undefined;

  const content = contentSummaryFixtures.find((item) => item.id === contentId);
  if (!content || content.id !== contentId || content.projectId !== project.id) return undefined;

  return {
    workspace,
    project,
    content,
    readiness: "needs-connection",
    platform: { name: "Not connected", status: "unavailable" },
    checklist: [
      { id: "content-selected", label: "Content selected", status: "ready", detail: content.title },
      { id: "draft-available", label: "Draft available", status: "ready", detail: `Current status: ${formatStatus(content.status)}` },
      { id: "platform-connection", label: "Platform connection", status: "pending", detail: "No publishing platform is connected." },
    ],
  };
}

function formatStatus(status: string): string {
  return status.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
