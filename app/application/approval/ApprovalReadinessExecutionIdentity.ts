import {
  approvalReadinessInspectionVersion,
  canonicalizeApprovalEvidenceUrl,
  isApprovalEvidenceSelectedSource,
  resolveApprovalEvidenceRequirement,
  resolveApprovalTemporalRequirement,
} from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import { editorialRevisionId } from "../../../core/quality";
import type { UserContent } from "../../user-flow/user-data";
import { internalLinkCatalogContextKey } from "../publishing/InternalLinkCatalogPolicy";

/**
 * The inspection contract version is owned by Core so the Quality engine, the
 * readiness service and this identity helper cannot disagree about it.
 */
export { approvalReadinessInspectionVersion };

export function approvalReadinessExecutionIdentity(
  content: UserContent,
  connectionId?: string,
): Readonly<{
  version: typeof approvalReadinessInspectionVersion;
  key: string;
  editorialRevisionId: string;
  publishingContextKey: string;
  evidenceFingerprint: string;
}> {
  if (!content.document) throw new Error("승인 준비 실행 식별자를 만들 기준 원고가 없습니다.");
  const revisionId = editorialRevisionId(content.document);
  const publishingContextKey = internalLinkCatalogContextKey(content, connectionId);
  const evidenceFingerprint = approvalEvidenceFingerprint(content.document);
  const policy = content.document.metadata?.approvalPolicy;
  const policyIdentity = policy
    ? [policy.policyId, policy.policyVersion, policy.profileId, policy.profileVersion].join("@")
    : undefined;
  const applicabilityIdentity = [
    `evidence-${resolveApprovalEvidenceRequirement(content.opportunity)}`,
    `temporal-${resolveApprovalTemporalRequirement(content.opportunity)}`,
  ].join("@");
  return Object.freeze({
    version: approvalReadinessInspectionVersion,
    key: [
      approvalReadinessInspectionVersion,
      policyIdentity ?? "no-approval-policy",
      applicabilityIdentity,
      content.id,
      revisionId,
      publishingContextKey,
      evidenceFingerprint,
    ].join("::"),
    editorialRevisionId: revisionId,
    publishingContextKey,
    evidenceFingerprint,
  });
}

/**
 * Search-candidate discovery is deliberately excluded from execution identity.
 * A new candidate alone must not invalidate a verified Claim snapshot. Only a
 * selected or explicitly user-owned Evidence source changes readiness identity.
 */
export function approvalEvidenceFingerprint(document: ContentDocument): string {
  const sources = (document.metadata?.approvalEvidence?.sources ?? [])
    .filter(isApprovalEvidenceSelectedSource)
    .map((source) => ({
      canonicalUrl: canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url),
      provenance: source.provenance
        ?? (source.cited === true ? "citation" : source.selected === true ? "user_selected" : "search_candidate"),
      citationExcerpt: source.citationExcerpt ?? "",
      linkedBlockIds: [...(source.linkedBlockIds ?? [])].sort(),
    }))
    .sort((left, right) => `${left.canonicalUrl}:${left.provenance}`.localeCompare(`${right.canonicalUrl}:${right.provenance}`));
  const source = JSON.stringify(sources);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `evidence-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
