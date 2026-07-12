import type { ProjectSummary, WorkspaceSummary } from "../shared/view-models/workspace";
import { projectFixtures, workspaceFixtures } from "../workspaces/workspace-fixtures";

export type ContentSummary = Readonly<{
  id: string;
  projectId: string;
  title: string;
  status: "draft" | "in-review" | "ready" | "published";
  updatedAt: string;
}>;

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
    createdAt: "June 18, 2026",
    publishProgress: { published: 1, total: 3 },
    actions: ["Edit project", "Archive project"],
  },
  {
    projectId: "editorial-system",
    createdAt: "June 23, 2026",
    publishProgress: { published: 0, total: 2 },
    actions: ["Edit project", "Archive project"],
  },
  {
    projectId: "launch-series",
    createdAt: "July 2, 2026",
    publishProgress: { published: 0, total: 0 },
    actions: ["Edit project", "Archive project"],
  },
  {
    projectId: "healthy-habits",
    createdAt: "June 28, 2026",
    publishProgress: { published: 1, total: 2 },
    actions: ["Edit project", "Archive project"],
  },
] as const;

export const contentSummaryFixtures: readonly ContentSummary[] = [
  { id: "content-workflow-map", projectId: "content-operations", title: "A practical content workflow map", status: "published", updatedAt: "Today" },
  { id: "content-quality-checklist", projectId: "content-operations", title: "Quality review checklist", status: "in-review", updatedAt: "Yesterday" },
  { id: "content-publishing-rhythm", projectId: "content-operations", title: "Building a sustainable publishing rhythm", status: "draft", updatedAt: "3 days ago" },
  { id: "editorial-principles", projectId: "editorial-system", title: "Editorial principles that scale", status: "ready", updatedAt: "Yesterday" },
  { id: "review-guide", projectId: "editorial-system", title: "A focused review guide", status: "draft", updatedAt: "4 days ago" },
  { id: "healthy-morning", projectId: "healthy-habits", title: "A healthier morning routine", status: "published", updatedAt: "2 days ago" },
  { id: "healthy-walking", projectId: "healthy-habits", title: "Making daily walks easier", status: "draft", updatedAt: "5 days ago" },
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
