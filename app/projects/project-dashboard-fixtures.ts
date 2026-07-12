import type { ProjectSummary, WorkspaceSummary } from "../shared/view-models/workspace";
import type { ContentSummary } from "../shared/view-models/content";
import { contentSummaryFixtures } from "../shared/fixtures/content";
import { projectFixtures, workspaceFixtures } from "../workspaces/workspace-fixtures";

export type ProjectDashboardDetails = Readonly<{
  projectId: string;
  createdAt: string;
  publishProgress: Readonly<{
    published: number;
    total: number;
  }>;
  actions: readonly string[];
}>;

export type ProjectDashboardState = Readonly<{
  workspace: WorkspaceSummary;
  project: ProjectSummary;
  details: ProjectDashboardDetails;
  contents: readonly ContentSummary[];
}>;

const projectDetailsFixtures: readonly ProjectDashboardDetails[] = [
  {
    projectId: "content-operations",
    createdAt: "2026년 6월 18일",
    publishProgress: { published: 1, total: 3 },
    actions: ["Edit project", "Archive project"],
  },
  {
    projectId: "editorial-system",
    createdAt: "2026년 6월 23일",
    publishProgress: { published: 0, total: 2 },
    actions: ["Edit project", "Archive project"],
  },
  {
    projectId: "launch-series",
    createdAt: "2026년 7월 2일",
    publishProgress: { published: 0, total: 0 },
    actions: ["Edit project", "Archive project"],
  },
  {
    projectId: "healthy-habits",
    createdAt: "2026년 6월 28일",
    publishProgress: { published: 1, total: 2 },
    actions: ["Edit project", "Archive project"],
  },
] as const;

export function getProjectDashboardState(workspaceId: string, projectId: string): ProjectDashboardState | undefined {
  const workspace = workspaceFixtures.find((item) => item.id === workspaceId);
  if (!workspace || workspace.id !== workspaceId) return undefined;

  const project = projectFixtures.find((item) => item.id === projectId);
  if (!project || project.id !== projectId || project.workspaceId !== workspace.id) return undefined;

  const details = projectDetailsFixtures.find((item) => item.projectId === project.id);
  if (!details) return undefined;

  return {
    workspace,
    project,
    details,
    contents: contentSummaryFixtures.filter((content) => content.projectId === project.id),
  };
}
