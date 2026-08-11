import { withCanonicalEditorialContext } from "../../../core/ai/AIWorkflow";
import { normalizeApprovalDateOwnership } from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import { projectStrategyAIContext } from "../ContentPlanningStrategy";
import {
  resolveProjectStrategy,
  type UserContent,
  type UserData,
} from "../../user-flow/user-data";
import { withApprovalGenerationTrace } from "./ApprovalGenerationTrace";
import {
  contentBoundEditorialContext,
  editorialContextWithoutDiversityPolicy,
  resolveContentApprovalSnapshot,
} from "./ApprovalContentPolicy";

export function contentEditorialContext(
  data: UserData,
  content: UserContent,
): string {
  const project = data.projects.find((item) =>
    item.id === content.projectId
    && (!data.workspace || item.workspaceId === data.workspace.id));
  if (!project) throw new Error("Content approval context requires its owning Project.");
  const brandName = project.brandId
    ? data.brands.find((brand) =>
        brand.id === project.brandId
        && brand.workspaceId === project.workspaceId)?.name
    : undefined;
  return contentBoundEditorialContext(
    {
      ...projectStrategyAIContext(resolveProjectStrategy(project)),
      projectIdentity: Object.freeze({
        projectName: project.name,
        ...(brandName ? { brandName } : {}),
      }),
    },
    content,
    recentProjectEditorialDocuments(data, content),
  );
}

/**
 * The most recently written articles of the same Project, newest first. Scoped
 * to the Project because that is the unit that maps to one published site, so
 * repetition matters within it and not across unrelated sites.
 */
function recentProjectEditorialDocuments(
  data: UserData,
  content: UserContent,
): readonly ContentDocument[] {
  return data.contents
    .filter((item) => item.projectId === content.projectId
      && item.id !== content.id
      && Boolean(item.document?.title.trim()))
    .slice()
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .map((item) => item.document!);
}

/**
 * Repair-time instructions must not carry the diversity policy. Their contract
 * is to satisfy the approval thresholds for this article, and asking the same
 * call to also differ from recent articles invites a restructure that loses the
 * contract. Diversity belongs to planning and generation.
 */
export function approvalAwareInstruction(
  instruction: string,
  data: UserData,
  content: UserContent,
): string {
  return withCanonicalEditorialContext(
    instruction,
    editorialContextWithoutDiversityPolicy(contentEditorialContext(data, content)),
  );
}

export function preserveContentApprovalPolicy(
  document: ContentDocument,
  content: UserContent,
): ContentDocument {
  const approvalPolicy = resolveContentApprovalSnapshot(content);
  const metadata = document.metadata ? { ...document.metadata } : undefined;
  if (metadata) {
    Reflect.deleteProperty(metadata as Record<string, unknown>, "approvalPolicy");
  }
  if (!approvalPolicy) {
    return metadata
      ? Object.freeze({ ...document, metadata: Object.freeze(metadata) })
      : document;
  }
  if (!metadata) {
    throw new Error("Approval preparation content requires canonical document metadata.");
  }
  const protectedDocument = Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...metadata,
      approvalPolicy,
    }),
  });
  const normalizedDocument = normalizeApprovalDateOwnership(protectedDocument);
  return withApprovalGenerationTrace(normalizedDocument, content.document);
}
