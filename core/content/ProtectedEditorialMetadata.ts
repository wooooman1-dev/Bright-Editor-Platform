import type { ApprovalEvidencePack } from "../approval";
import type { ContentDocument } from "./ContentDocument";

export function restoreProtectedEditorialMetadata(
  current: ContentDocument,
  candidate: ContentDocument,
): ContentDocument {
  const currentMetadata = current.metadata;
  if (!currentMetadata) return candidate;
  const candidateMetadata = candidate.metadata ?? currentMetadata;
  const approvalEvidence = resetApprovalEvidence(currentMetadata.approvalEvidence);
  return Object.freeze({
    ...candidate,
    metadata: Object.freeze({
      ...candidateMetadata,
      ...(currentMetadata.approvalPolicy
        ? { approvalPolicy: currentMetadata.approvalPolicy }
        : {}),
      ...(approvalEvidence ? { approvalEvidence } : {}),
      ...(currentMetadata.siteApprovalReadiness
        ? { siteApprovalReadiness: currentMetadata.siteApprovalReadiness }
        : {}),
    }),
  });
}

function resetApprovalEvidence(
  pack: ApprovalEvidencePack | undefined,
): ApprovalEvidencePack | undefined {
  if (!pack?.sources.length) return undefined;
  return Object.freeze({
    version: "1.0",
    status: "needs_review",
    sources: Object.freeze(pack.sources.map((source) => Object.freeze({
      ...source,
      verified: false,
      selected: false,
      verificationStatus: undefined,
      failureReason: undefined,
      matchedFacts: undefined,
      checkedAt: undefined,
    }))),
  });
}
