import { withCanonicalEditorialContext } from "../../../core/ai";
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
  );
}

export function approvalAwareInstruction(
  instruction: string,
  data: UserData,
  content: UserContent,
): string {
  return withCanonicalEditorialContext(
    instruction,
    contentEditorialContext(data, content),
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
  return withApprovalGenerationTrace(protectedDocument, content.document);
}
