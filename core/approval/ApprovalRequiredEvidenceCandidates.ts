import type { ContentDocument } from "../content";
import {
  extractProfileApprovalFacts,
  requiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicy";
import { canonicalizeApprovalEvidenceUrl } from "./ApprovalEvidenceSelection";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import type { ApprovalEvidenceSource } from "./ApprovalReadiness";

type RequiredOfficialSource = Readonly<{
  url: string;
  title: string;
  publisher: string;
  fields: readonly string[];
}>;

/**
 * Adds the canonical official pages required by known deterministic Claim roles.
 *
 * Search results remain candidates. A source from this catalog is selected only
 * when the current manuscript actually requires one of its Claim roles. This
 * prevents a random search result from occupying a required legal Evidence slot
 * while also avoiding another AI call.
 */
export function ensureRequiredApprovalEvidenceCandidates(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
): ContentDocument {
  const pack = document.metadata?.approvalEvidence;
  if (!pack) return document;

  const facts = extractProfileApprovalFacts(document, profileId);
  const requiredFields = new Set(requiredApprovalFactFields(document, profileId, facts));
  const requiredSources = requiredOfficialSources.filter((source) =>
    source.fields.some((field) => requiredFields.has(field)));

  const requiredByUrl = new Map(requiredSources.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source,
  ]));
  const seen = new Set<string>();
  let changed = false;

  const sources = pack.sources.map((source) => {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url);
    seen.add(canonicalUrl);
    const required = requiredByUrl.get(canonicalUrl);

    if (required) {
      const next = promoteRequiredSource(source, canonicalUrl);
      if (next !== source) changed = true;
      return next;
    }

    if (source.provenance === "citation") {
      changed = true;
      return Object.freeze({
        ...source,
        url: canonicalUrl,
        canonicalUrl,
        provenance: "search_candidate" as const,
        selected: false,
      });
    }

    if (canonicalUrl !== source.url || canonicalUrl !== source.canonicalUrl) {
      changed = true;
      return Object.freeze({
        ...source,
        url: canonicalUrl,
        canonicalUrl,
      });
    }

    return source;
  });

  for (const required of requiredSources) {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(required.url);
    if (seen.has(canonicalUrl)) continue;
    changed = true;
    sources.push(requiredSourceCandidate(
      required,
      canonicalUrl,
      document.metadata?.updatedAt ?? document.metadata?.createdAt ?? "1970-01-01T00:00:00.000Z",
    ));
  }

  if (!changed) return document;
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata!,
      approvalEvidence: Object.freeze({
        ...pack,
        status: "needs_review" as const,
        coverageStatus: "needs_review" as const,
        reviewedAt: undefined,
        sources: Object.freeze(sources),
      }),
    }),
  });
}

function promoteRequiredSource(
  source: ApprovalEvidenceSource,
  canonicalUrl: string,
): ApprovalEvidenceSource {
  if (source.provenance === "system_verified"
    && source.selected === true
    && source.url === canonicalUrl
    && source.canonicalUrl === canonicalUrl) {
    return source;
  }

  return Object.freeze({
    ...source,
    url: canonicalUrl,
    canonicalUrl,
    provenance: "system_verified" as const,
    selected: true,
  });
}

function requiredSourceCandidate(
  source: RequiredOfficialSource,
  canonicalUrl: string,
  retrievedAt: string,
): ApprovalEvidenceSource {
  return Object.freeze({
    sourceId: `required-official-${stableSourceId(canonicalUrl)}`,
    url: canonicalUrl,
    canonicalUrl,
    title: source.title,
    publisher: source.publisher,
    sourceType: "official_law" as const,
    retrievedAt,
    verified: false,
    facts: Object.freeze([]),
    provenance: "system_verified" as const,
    selected: true,
  });
}

function stableSourceId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const requiredOfficialSources: readonly RequiredOfficialSource[] = Object.freeze([
  Object.freeze({
    url: "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031805825",
    title: "방문판매 등에 관한 법률 제2조 | 국가법령정보센터",
    publisher: "국가법령정보센터",
    fields: Object.freeze(["continuingTransactionDefinition"]),
  }),
  Object.freeze({
    url: "https://law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1000070098",
    title: "방문판매 등에 관한 법률 시행령 제37조 | 국가법령정보센터",
    publisher: "국가법령정보센터",
    fields: Object.freeze(["continuingTransactionArticle30Threshold"]),
  }),
  Object.freeze({
    url: "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1025033501",
    title: "방문판매 등에 관한 법률 제30조부터 제32조 | 국가법령정보센터",
    publisher: "국가법령정보센터",
    fields: Object.freeze([
      "continuingTransactionContractDocument",
      "excessiveTerminationPenalty",
      "excessPaymentRefund",
    ]),
  }),
]);
