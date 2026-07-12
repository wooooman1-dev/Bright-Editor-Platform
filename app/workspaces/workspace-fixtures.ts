import type { ProjectSummary, WorkspaceSummary } from "../shared/view-models/workspace";

export type WorkspaceViewState = Readonly<{
  workspace: WorkspaceSummary;
  projects: readonly ProjectSummary[];
}>;

export const workspaceFixtures: readonly WorkspaceSummary[] = [
  {
    id: "bright-studio",
    name: "Bright Studio",
    description: "A quality-first brand for building professional content systems.",
    audience: "Content creators and operators",
    updatedAt: "Updated today",
  },
  {
    id: "bright-health",
    name: "Bright Health",
    description: "A trusted health information brand for practical daily guidance.",
    audience: "Health-conscious readers",
    updatedAt: "Updated 5 days ago",
  },
  {
    id: "new-brand",
    name: "New Brand",
    description: "A new brand workspace ready for its first focused project.",
    audience: "Audience not defined",
    updatedAt: "Created today",
  },
] as const;

export const projectFixtures: readonly ProjectSummary[] = [
  { id: "content-operations", workspaceId: "bright-studio", name: "Content Operations Foundation", description: "Build the first repeatable content workflow.", status: "in-progress", updatedAt: "Today" },
  { id: "editorial-system", workspaceId: "bright-studio", name: "Editorial System", description: "Define a consistent quality-first production process.", status: "review", updatedAt: "Yesterday" },
  { id: "launch-series", workspaceId: "bright-studio", name: "Launch Series", description: "Plan the first multi-channel publishing series.", status: "planning", updatedAt: "3 days ago" },
  { id: "healthy-habits", workspaceId: "bright-health", name: "Healthy Habits Series", description: "Create a practical evergreen health series.", status: "in-progress", updatedAt: "2 days ago" },
] as const;

export function getWorkspaceViewState(workspaceId: string): WorkspaceViewState | undefined {
  const workspace = workspaceFixtures.find((item) => item.id === workspaceId);
  if (!workspace) return undefined;

  return {
    workspace,
    projects: projectFixtures.filter((project) => project.workspaceId === workspace.id),
  };
}
