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
    name: "콘텐츠 운영 기반",
    description: "반복 가능한 첫 콘텐츠 작업 흐름을 구축합니다.",
    status: "in-progress",
    updatedAt: "오늘",
    nextAction: "프로젝트 설정 이어가기",
    progress: 64,
  },
  recentProjects: [
    {
      id: "content-operations",
      workspaceId: "bright-studio",
      name: "콘텐츠 운영 기반",
      description: "반복 가능한 첫 콘텐츠 작업 흐름을 구축합니다.",
      status: "in-progress",
      updatedAt: "오늘",
    },
    {
      id: "editorial-system",
      workspaceId: "bright-studio",
      name: "편집 시스템",
      description: "일관된 품질 중심 제작 과정을 정의합니다.",
      status: "review",
      updatedAt: "어제",
    },
    {
      id: "launch-series",
      workspaceId: "bright-studio",
      name: "출시 시리즈",
      description: "첫 멀티채널 콘텐츠 시리즈를 기획합니다.",
      status: "planning",
      updatedAt: "3일 전",
    },
  ],
};
