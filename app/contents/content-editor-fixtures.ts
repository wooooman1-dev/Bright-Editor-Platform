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
  "content-workflow-map": "A dependable content workflow starts with a clear goal. Define the audience, shape the idea, create the draft, and review the result before publishing.\n\nKeep each step visible so the next action is always easy to understand.",
  "content-quality-checklist": "Review the purpose, structure, clarity, and usefulness of every draft. Confirm that each section helps the reader move toward the intended outcome.",
  "content-publishing-rhythm": "A sustainable publishing rhythm balances consistency with quality. Choose a pace that leaves enough time for thoughtful creation and review.",
  "editorial-principles": "Strong editorial systems make quality repeatable. Establish clear standards for voice, structure, evidence, and review.",
  "review-guide": "Begin each review with the reader's goal. Remove distractions, clarify the main idea, and make the next step obvious.",
  "healthy-morning": "A healthier morning can begin with small choices: drink water, move gently, and prepare a simple breakfast that supports steady energy.",
  "healthy-walking": "Make daily walks easier by choosing a regular time, keeping comfortable shoes nearby, and starting with a distance that feels achievable.",
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
