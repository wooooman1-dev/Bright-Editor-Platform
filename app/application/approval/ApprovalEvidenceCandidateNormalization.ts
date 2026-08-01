import { canonicalizeApprovalEvidenceUrl } from "../../../core/approval";
import type { ApprovalEvidenceProvenance, ApprovalEvidenceSource } from "../../../core/approval";
import { contentBlockOwnership } from "../../../core/content";
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
    const same = JSON.stringify(sources) === JSON.stringify(before);
    if (same) return content;
    changed = true;
    const metadata = { ...content.document.metadata };
    delete metadata.approvalReadinessExecution;
    const blocks = Object.freeze(content.document.blocks.filter((block) =>
      contentBlockOwnership(block) !== "system_source_projection"));
    return {
      ...content,
      document: {
        ...content.document,
        blocks,
        metadata: {
          ...metadata,
          buttonCount: blocks.filter((block) => block.type === "button").length,
          approvalEvidence: {
            ...content.document.metadata.approvalEvidence,
            reviewedAt: undefined,
            reviewedRevisionId: undefined,
            status: sources.length ? "needs_review" as const : "missing" as const,
            coverageStatus: sources.length ? "needs_review" as const : "missing" as const,
            verifiedFactFields: Object.freeze([]),
            unverifiedFactFields: content.document.metadata.approvalEvidence.requiredFactFields
              ?? content.document.metadata.approvalEvidence.unverifiedFactFields,
            presentationStatus: "not_projected" as const,
            presentationReasons: undefined,
            sources,
          },
        },
      },
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
    if (!canonicalUrl.startsWith("https://")) continue;
    const provenance = source.provenance
      ?? (source.cited === true ? "citation" : source.selected === true ? "user_selected" : "search_candidate");
    const normalized = Object.freeze({
      ...source,
      originalUrl: source.originalUrl ?? source.url,
      url: canonicalUrl,
      canonicalUrl,
      provenance,
      verified: false,
      cited: provenance === "citation",
      selected: provenance === "citation" || provenance === "user_selected",
      verificationStatus: undefined,
      accessVerificationStatus: "not_evaluated" as const,
      officialDomainVerificationStatus: "not_evaluated" as const,
      claimVerificationStatus: "not_evaluated" as const,
      failureReason: undefined,
      matchedFacts: undefined,
      checkedAt: undefined,
    });
    sources.set(canonicalUrl, mergeCanonicalSource(sources.get(canonicalUrl), normalized));
  }
  return Object.freeze([...sources.values()].filter((source) =>
    source.provenance !== "search_candidate"));
}

function mergeCanonicalSource(
  previous: ApprovalEvidenceSource | undefined,
  next: ApprovalEvidenceSource,
): ApprovalEvidenceSource {
  if (!previous) return next;
  const preferred = provenancePriority(next.provenance) > provenancePriority(previous.provenance)
    ? next
    : previous;
  const alternate = preferred === next ? previous : next;
  const facts = new Map([...previous.facts, ...next.facts].map((fact) => [`${fact.field}:${fact.value}`, fact]));
  return Object.freeze({
    ...alternate,
    ...preferred,
    url: next.canonicalUrl ?? next.url,
    canonicalUrl: next.canonicalUrl ?? next.url,
    originalUrl: preferred.originalUrl ?? alternate.originalUrl,
    cited: previous.cited === true || next.cited === true || preferred.provenance === "citation",
    selected: preferred.provenance === "citation" || preferred.provenance === "user_selected",
    citationExcerpt: preferred.citationExcerpt ?? alternate.citationExcerpt,
    linkedBlockIds: Object.freeze([...new Set([...(previous.linkedBlockIds ?? []), ...(next.linkedBlockIds ?? [])])]),
    facts: Object.freeze([...facts.values()]),
  });
}

function provenancePriority(value: ApprovalEvidenceProvenance | undefined): number {
  return value === "citation" ? 4
    : value === "user_selected" ? 3
      : value === "document_link" ? 2
        : value === "search_candidate" ? 1
          : 0;
}
