import { canonicalizeApprovalEvidenceUrl } from "../../../core/approval";
import type { ApprovalEvidenceSource } from "../../../core/approval";
import type { UserData } from "../../user-flow/user-data";

export function normalizeApprovalEvidenceCandidates(
  data: UserData,
  contentId: string,
): UserData {
  let changed = false;
  const contents = data.contents.map((content) => {
    if (content.id !== contentId || !content.document?.metadata?.approvalEvidence?.sources.length) return content;
    const sources = canonicalSources(content.document.metadata.approvalEvidence.sources);
    const before = content.document.metadata.approvalEvidence.sources;
    const same = sources.length === before.length
      && sources.every((source, index) => source.url === before[index]?.url);
    if (same) return content;
    changed = true;
    return {
      ...content,
      document: {
        ...content.document,
        metadata: {
          ...content.document.metadata,
          approvalEvidence: {
            ...content.document.metadata.approvalEvidence,
            reviewedAt: undefined,
            reviewedRevisionId: undefined,
            status: "needs_review" as const,
            sources,
          },
        },
      },
      quality: undefined,
      status: "in_review" as const,
    };
  });
  return changed ? { ...data, contents } : data;
}

export function canonicalSources(
  values: readonly ApprovalEvidenceSource[],
): readonly ApprovalEvidenceSource[] {
  const sources = new Map<string, ApprovalEvidenceSource>();
  for (const source of values) {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.url);
    if (!canonicalUrl.startsWith("https://") || sources.has(canonicalUrl)) continue;
    sources.set(canonicalUrl, Object.freeze({
      ...source,
      url: canonicalUrl,
      canonicalUrl,
      verified: false,
      selected: false,
      verificationStatus: undefined,
      failureReason: undefined,
      matchedFacts: undefined,
      checkedAt: undefined,
    }));
  }
  return Object.freeze([...sources.values()]);
}
