export type HomeStateName =
  | "first-visit"
  | "empty-workspace"
  | "working"
  | "power-user"
  | "publish-complete";

import type {
  ProjectSummary,
  WorkspaceSummary,
} from "../shared/view-models/workspace";

export type ActiveProject = ProjectSummary &
  Readonly<{ nextAction: string; progress: number }>;

export type HomeState = Readonly<{
  name: HomeStateName;
  workspaces: readonly WorkspaceSummary[];
  selectedWorkspaceId?: string;
  activeProject?: ActiveProject;
  recentProjects: readonly ProjectSummary[];
}>;

export const sprintThreeHomeState: HomeState = {
  name: "working",
  workspaces: [
    { id: "bright-studio", name: "Bright Studio" },
    { id: "bright-health", name: "Bright Health" },
  ],
  selectedWorkspaceId: "bright-studio",
  activeProject: {
    id: "content-operations",
    workspaceId: "bright-studio",
    name: "Content Operations Foundation",
    description: "Build the first repeatable content workflow.",
    status: "in-progress",
    updatedAt: "Today",
    nextAction: "Continue project setup",
    progress: 64,
  },
  recentProjects: [
    {
      id: "content-operations",
      workspaceId: "bright-studio",
      name: "Content Operations Foundation",
      description: "Build the first repeatable content workflow.",
      status: "in-progress",
      updatedAt: "Today",
    },
    {
      id: "editorial-system",
      workspaceId: "bright-studio",
      name: "Editorial System",
      description: "Define a consistent quality-first production process.",
      status: "review",
      updatedAt: "Yesterday",
    },
    {
      id: "launch-series",
      workspaceId: "bright-studio",
      name: "Launch Series",
      description: "Plan the first multi-channel publishing series.",
      status: "planning",
      updatedAt: "3 days ago",
    },
  ],
};
