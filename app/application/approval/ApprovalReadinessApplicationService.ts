import {
  ensureRequiredApprovalEvidenceCandidates,
  normalizeApprovalDateOwnership,
  type ApprovalPolicyProfileId,
} from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import { editorialRevisionId } from "../../../core/quality";
import type { UserContent, UserData } from "../../user-flow/user-data";
import {
  approvalReadinessExecutionIdentity,
  approvalReadinessInspectionVersion,
} from "./ApprovalReadinessExecutionIdentity";
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
      const approvalProfileId = (content as UserContent & {
        approvalProfileId?: ApprovalPolicyProfileId;
      }).approvalProfileId;
      let document = normalizeApprovalDateOwnership(source);
      if (approvalProfileId) {
        document = ensureRequiredApprovalEvidenceCandidates(document, approvalProfileId);
      }
      if (document !== source) effectiveInput = { ...input, data: withNormalizedDocument(input.data, content, document) };
    }
    const result = await super.execute(effectiveInput);
    /**
     * A run that inspected nothing must not leave a "completed" inspection
     * identity behind; that record is what later tells the service and the UI
     * that the stored artefacts are current.
     */
    if (!result.inspectionPerformed) return result;
    return withCurrentInspectionIdentity(result, input.connection?.id);
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

function withCurrentInspectionIdentity(
  result: ApprovalReadinessExecutionResult,
  connectionId?: string,
): ApprovalReadinessExecutionResult {
  const content = result.data.contents.find((item) => item.document?.id === result.document.id)
    ?? result.data.contents.find((item) => item.id === result.document.id);
  if (!content) return result;

  const identity = approvalReadinessExecutionIdentity(
    { ...content, document: result.document },
    connectionId,
  );
  const execution = result.document.metadata?.approvalReadinessExecution;
  if (execution
    && execution.version === approvalReadinessInspectionVersion
    && execution.key === identity.key
    && execution.editorialRevisionId === identity.editorialRevisionId
    && execution.publishingContextKey === identity.publishingContextKey
    && execution.evidenceFingerprint === identity.evidenceFingerprint) {
    return result;
  }

  const checkedAt = execution?.checkedAt ?? new Date().toISOString();
  const document: ContentDocument = Object.freeze({
    ...result.document,
    metadata: Object.freeze({
      ...result.document.metadata!,
      approvalReadinessExecution: Object.freeze({
        version: approvalReadinessInspectionVersion,
        key: identity.key,
        editorialRevisionId: identity.editorialRevisionId,
        publishingContextKey: identity.publishingContextKey,
        evidenceFingerprint: identity.evidenceFingerprint,
        status: "completed" as const,
        checkedAt,
      }),
    }),
  });
  const data: UserData = {
    ...result.data,
    contents: result.data.contents.map((item) => item.id === content.id ? { ...item, document } : item),
  };
  return Object.freeze({ ...result, document, data });
}
