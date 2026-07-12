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
    name: "연결되지 않음";
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
    platform: { name: "연결되지 않음", status: "unavailable" },
    checklist: [
      { id: "content-selected", label: "콘텐츠 선택", status: "ready", detail: content.title },
      { id: "draft-available", label: "초안 확인", status: "ready", detail: `현재 상태: ${formatStatus(content.status)}` },
      { id: "platform-connection", label: "플랫폼 연결", status: "pending", detail: "연결된 발행 플랫폼이 없습니다." },
    ],
  };
}

function formatStatus(status: string): string {
  return { draft: "초안", "in-review": "검토 중", ready: "준비됨", published: "발행됨" }[status] ?? status;
}
