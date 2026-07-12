import type { ProjectSummary, WorkspaceSummary } from "../shared/view-models/workspace";

export type WorkspaceViewState = Readonly<{
  workspace: WorkspaceSummary;
  projects: readonly ProjectSummary[];
}>;

export const workspaceFixtures: readonly WorkspaceSummary[] = [
  {
    id: "bright-studio",
    name: "Bright Studio",
    description: "전문적인 콘텐츠 시스템을 만드는 품질 중심 브랜드입니다.",
    audience: "콘텐츠 제작자와 운영자",
    updatedAt: "오늘 수정",
  },
  {
    id: "bright-health",
    name: "Bright Health",
    description: "실용적인 일상 지침을 제공하는 신뢰도 높은 건강 정보 브랜드입니다.",
    audience: "건강에 관심 있는 독자",
    updatedAt: "5일 전 수정",
  },
  {
    id: "new-brand",
    name: "새 브랜드",
    description: "첫 번째 목적 중심 프로젝트를 시작할 새 브랜드 워크스페이스입니다.",
    audience: "대상 독자 미정",
    updatedAt: "오늘 생성",
  },
] as const;

export const projectFixtures: readonly ProjectSummary[] = [
  { id: "content-operations", workspaceId: "bright-studio", name: "콘텐츠 운영 기반", description: "반복 가능한 첫 콘텐츠 작업 흐름을 구축합니다.", status: "in-progress", updatedAt: "오늘" },
  { id: "editorial-system", workspaceId: "bright-studio", name: "편집 시스템", description: "일관된 품질 중심 제작 과정을 정의합니다.", status: "review", updatedAt: "어제" },
  { id: "launch-series", workspaceId: "bright-studio", name: "출시 시리즈", description: "첫 멀티채널 콘텐츠 시리즈를 기획합니다.", status: "planning", updatedAt: "3일 전" },
  { id: "healthy-habits", workspaceId: "bright-health", name: "건강한 습관 시리즈", description: "실용적인 상시 건강 콘텐츠 시리즈를 만듭니다.", status: "in-progress", updatedAt: "2일 전" },
] as const;

export function getWorkspaceViewState(workspaceId: string): WorkspaceViewState | undefined {
  const workspace = workspaceFixtures.find((item) => item.id === workspaceId);
  if (!workspace) return undefined;

  return {
    workspace,
    projects: projectFixtures.filter((project) => project.workspaceId === workspace.id),
  };
}
