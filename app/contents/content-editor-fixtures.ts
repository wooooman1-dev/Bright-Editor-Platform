import { contentSummaryFixtures } from "../shared/fixtures/content";
import type { ContentStatus } from "../shared/view-models/content";
import type { ProjectSummary, WorkspaceSummary } from "../shared/view-models/workspace";
import { projectFixtures, workspaceFixtures } from "../workspaces/workspace-fixtures";

export type ContentEditorViewModel = Readonly<{
  id: string;
  projectId: string;
  title: string;
  body: string;
  status: ContentStatus;
  updatedAt: string;
}>;

export type ContentEditorState = Readonly<{
  workspace: WorkspaceSummary;
  project: ProjectSummary;
  content: ContentEditorViewModel;
}>;

const contentBodyFixtures: Readonly<Record<string, string>> = {
  "content-workflow-map": "신뢰할 수 있는 콘텐츠 작업 흐름은 명확한 목표에서 시작합니다. 독자를 정의하고, 아이디어를 구체화하고, 초안을 작성한 뒤 발행 전에 결과를 검토하세요.\n\n각 단계를 눈에 보이게 유지하면 다음 작업을 언제나 쉽게 이해할 수 있습니다.",
  "content-quality-checklist": "모든 초안의 목적, 구조, 명확성, 유용성을 검토하세요. 각 섹션이 독자의 목표 달성에 도움이 되는지 확인합니다.",
  "content-publishing-rhythm": "지속 가능한 발행 주기는 일관성과 품질의 균형을 맞춥니다. 충분히 작성하고 검토할 수 있는 속도를 선택하세요.",
  "editorial-principles": "탄탄한 편집 시스템은 품질을 반복 가능하게 만듭니다. 문체, 구조, 근거, 검토 기준을 명확히 세우세요.",
  "review-guide": "독자의 목표에서 검토를 시작하세요. 방해 요소를 제거하고 핵심 아이디어와 다음 단계를 명확하게 만드세요.",
  "healthy-morning": "물 마시기, 가벼운 움직임, 균형 잡힌 아침 식사 같은 작은 선택으로 더 건강한 아침을 시작할 수 있습니다.",
  "healthy-walking": "일정한 시간을 정하고 편한 신발을 가까이 두며 실천 가능한 거리부터 시작하면 매일 걷기가 쉬워집니다.",
};

export function getContentEditorState(workspaceId: string, projectId: string, contentId: string): ContentEditorState | undefined {
  const workspace = workspaceFixtures.find((item) => item.id === workspaceId);
  if (!workspace || workspace.id !== workspaceId) return undefined;

  const project = projectFixtures.find((item) => item.id === projectId);
  if (!project || project.id !== projectId || project.workspaceId !== workspace.id) return undefined;

  const content = contentSummaryFixtures.find((item) => item.id === contentId);
  if (!content || content.id !== contentId || content.projectId !== project.id) return undefined;

  const body = contentBodyFixtures[content.id];
  if (body === undefined) return undefined;

  return {
    workspace,
    project,
    content: { ...content, body },
  };
}
