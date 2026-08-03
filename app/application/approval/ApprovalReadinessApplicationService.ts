import { normalizeApprovalDateOwnership } from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import { editorialRevisionId } from "../../../core/quality";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { approvalReadinessInspectionVersion } from "./ApprovalReadinessExecutionIdentity";
import {
  ApprovalReadinessApplicationService as BaseApprovalReadinessApplicationService,
  type ApprovalReadinessExecutionResult,
} from "./ApprovalReadinessApplicationServiceBase";

export * from "./ApprovalReadinessApplicationServiceBase";

export class ApprovalReadinessApplicationService extends BaseApprovalReadinessApplicationService {
  override async execute(input: Parameters<BaseApprovalReadinessApplicationService["execute"]>[0]): Promise<ApprovalReadinessExecutionResult> {
    const content = input.data.contents.find((item) => item.id === input.contentId);
    const source = content?.document;
    let effectiveInput = input;
    if (content && source) {
      const document = normalizeApprovalDateOwnership(source);
      if (document !== source) effectiveInput = { ...input, data: withNormalizedDocument(input.data, content, document) };
    }
    const result = await super.execute(effectiveInput);
    return withCurrentInspectionVersion(result);
  }
}

function withNormalizedDocument(data: UserData, content: UserContent, document: ContentDocument): UserData {
  const normalizedAt = new Date().toISOString();
  const revisionId = editorialRevisionId(document);
  const quality = content.quality
    ? Object.freeze({ ...content.quality, reviewedRevisionId: revisionId })
    : undefined;
  const nextContent: UserContent = {
    ...content,
    document,
    ...(quality ? { quality } : {}),
    updatedAt: normalizedAt,
  };
  return {
    ...data,
    contents: data.contents.map((item) => item.id === content.id ? nextContent : item),
    ...(quality ? {
      qualityReports: [
        ...(data.qualityReports ?? []).filter((item) => item.contentId !== content.id),
        { contentId: content.id, report: quality },
      ],
    } : {}),
  };
}

function withCurrentInspectionVersion(result: ApprovalReadinessExecutionResult): ApprovalReadinessExecutionResult {
  const execution = result.document.metadata?.approvalReadinessExecution;
  if (!execution || execution.version === approvalReadinessInspectionVersion) return result;
  const document: ContentDocument = Object.freeze({
    ...result.document,
    metadata: Object.freeze({
      ...result.document.metadata!,
      approvalReadinessExecution: Object.freeze({ ...execution, version: approvalReadinessInspectionVersion }),
    }),
  });
  const content = result.data.contents.find((item) => item.id === result.document.id)
    ?? result.data.contents.find((item) => item.document?.id === result.document.id);
  const data: UserData = content ? {
    ...result.data,
    contents: result.data.contents.map((item) => item.id === content.id ? { ...item, document } : item),
  } : result.data;
  return Object.freeze({ ...result, document, data });
}
