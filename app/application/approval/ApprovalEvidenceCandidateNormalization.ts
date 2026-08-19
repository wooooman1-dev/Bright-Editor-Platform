import {
  canonicalizeApprovalEvidenceUrl,
  createNotRequiredApprovalEvidencePack,
  resolveApprovalEvidenceRequirement,
} from "../../../core/approval";
import type { ApprovalEvidenceProvenance, ApprovalEvidenceSource } from "../../../core/approval";
import { contentBlockOwnership } from "../../../core/content";
import type { UserData } from "../../user-flow/user-data";

export function normalizeApprovalEvidenceCandidates(
  data: UserData,
  contentId: string,
): UserData {
  let changed = false;
  const contents = data.contents.map((content) => {
    const evidence = content.document?.metadata?.approvalEvidence;
    if (content.id === contentId
      && evidence
      && resolveApprovalEvidenceRequirement(content.opportunity) === "not_required"
      && evidence.sources.length === 0
      && evidence.status === "missing") {
      const pack = createNotRequiredApprovalEvidencePack();
      if (JSON.stringify(evidence) === JSON.stringify(pack)) return content;
      changed = true;
      return {
        ...content,
        document: {
          ...content.document!,
          metadata: { ...content.document!.metadata!, approvalEvidence: pack },
        },
      };
    }
    if (content.id !== contentId || !content.document?.metadata?.approvalEvidence?.sources.length) return content;
    const sources = canonicalSources(content.document.metadata.approvalEvidence.sources);
    const before = content.document.metadata.approvalEvidence.sources;
    if (sameCanonicalSourceSet(before, sources)) return content;
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

/**
 * True when canonicalization would not change which sources the article relies
 * on or how they are identified.
 *
 * Comparing the whole source object made a *successfully verified* pack look
 * like a changed source set on the very next read, because `canonicalSources`
 * rewrites the verification outcome back to "not evaluated". That falsely
 * re-normalized the pack on every single run: the stored review date, the
 * reader-visible source section and the reusable inspection record were
 * discarded and every source was fetched and re-verified again, re-stamping
 * 출처 확인일 to the current date.
 *
 * So only fields that `canonicalSources` reads are compared. Fields it *writes*
 * are excluded, because their value in a stored pack says nothing about whether
 * the source set changed — it only says which stage wrote the pack last.
 *
 * A genuine change — a new, removed, re-canonicalized or re-provenanced source
 * — still fails this comparison and still forces a full re-verification.
 */
function sameCanonicalSourceSet(
  before: readonly ApprovalEvidenceSource[],
  canonical: readonly ApprovalEvidenceSource[],
): boolean {
  return JSON.stringify(before.map(canonicalSourceIdentity))
    === JSON.stringify(canonical.map(canonicalSourceIdentity));
}

/**
 * Fields `canonicalSources` derives or resets rather than preserves.
 *
 * `cited` and `selected` belong here even though they look like identity: this
 * module re-derives them from `provenance`, while the Core selection rule that
 * actually writes stored packs (`isApprovalEvidenceSelectedSource`) also treats
 * `system_verified` and `document_link` as selected. The two rules disagree, so
 * comparing the derived values re-broke every source that was not a plain
 * `citation` — which is most stored approval content. `provenance` itself is
 * compared and fully determines both values here, so nothing is lost.
 *
 * Listing what to drop, rather than what to keep, fails safe: a field added to
 * `ApprovalEvidenceSource` later counts as identity by default and forces
 * re-verification rather than being silently ignored.
 */
const canonicalizerOwnedFields = [
  "verified",
  "verificationStatus",
  "accessVerificationStatus",
  "officialDomainVerificationStatus",
  "claimVerificationStatus",
  "failureReason",
  "matchedFacts",
  "checkedAt",
  "cited",
  "selected",
] as const;

function canonicalSourceIdentity(source: ApprovalEvidenceSource): unknown {
  const identity: Record<string, unknown> = { ...source };
  for (const field of canonicalizerOwnedFields) Reflect.deleteProperty(identity, field);
  return identity;
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
  /**
   * 본문에 인용되지 않은 검색 후보는 출처가 아니다.
   *
   * 출처 목록은 원고를 가져온 곳의 기록이다. 검색 결과로 스쳐 갔을 뿐 본문이
   * 쓰지 않은 주소가 목록에 남으면, 독자에게는 근거처럼 보이지만 그 페이지에는
   * 그 내용이 없다. D-045 에서 출처를 본문 맨 끝에 그대로 표시하기로 했으므로
   * 이 구분이 더 중요해졌다.
   */
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
