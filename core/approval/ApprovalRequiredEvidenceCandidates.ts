import type { ContentDocument } from "../content";
import {
  extractProfileApprovalFacts,
  requiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicy";
import { canonicalizeApprovalEvidenceUrl } from "./ApprovalEvidenceSelection";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import type { ApprovalEvidenceFact, ApprovalEvidenceSource } from "./ApprovalReadiness";

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
  if (!requiredSources.length) return document;

  const requiredByIdentity = new Map(requiredSources.map((source) => [
    officialSourceIdentity(source.url),
    source,
  ]));
  const seen = new Set<string>();
  let changed = false;

  const sources = pack.sources.map((source) => {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url);
    const identity = officialSourceIdentity(canonicalUrl);
    seen.add(identity);
    const required = requiredByIdentity.get(identity);

    if (required) {
      const next = promoteRequiredSource(
        source,
        canonicalUrl,
        requiredClaimFacts(required, requiredFields),
      );
      if (next !== source) changed = true;
      return next;
    }

    if (shouldDemoteLegalCitation(source, canonicalUrl)) {
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
    const identity = officialSourceIdentity(canonicalUrl);
    if (seen.has(identity)) continue;
    changed = true;
    sources.push(requiredSourceCandidate(
      required,
      canonicalUrl,
      document.metadata?.updatedAt ?? document.metadata?.createdAt ?? "1970-01-01T00:00:00.000Z",
      requiredClaimFacts(required, requiredFields),
    ));
    seen.add(identity);
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
  requiredFacts: readonly ApprovalEvidenceFact[],
): ApprovalEvidenceSource {
  const facts = mergeRequiredFacts(source.facts, requiredFacts);
  if (source.provenance === "system_verified"
    && source.selected === true
    && source.url === canonicalUrl
    && source.canonicalUrl === canonicalUrl
    && facts === source.facts) {
    return source;
  }

  return Object.freeze({
    ...source,
    url: canonicalUrl,
    canonicalUrl,
    facts,
    provenance: "system_verified" as const,
    selected: true,
  });
}

function shouldDemoteLegalCitation(
  source: ApprovalEvidenceSource,
  canonicalUrl: string,
): boolean {
  if (source.provenance !== "citation") return false;
  try {
    return new URL(canonicalUrl).hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "") === "law.go.kr";
  } catch {
    return false;
  }
}

function requiredSourceCandidate(
  source: RequiredOfficialSource,
  canonicalUrl: string,
  retrievedAt: string,
  facts: readonly ApprovalEvidenceFact[],
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
    facts,
    provenance: "system_verified" as const,
    selected: true,
  });
}

function requiredClaimFacts(
  source: RequiredOfficialSource,
  requiredFields: ReadonlySet<string>,
): readonly ApprovalEvidenceFact[] {
  return Object.freeze(source.fields
    .filter((field) => requiredFields.has(field))
    .map((field) => Object.freeze({
      field,
      value: requiredClaimLabels[field] ?? field,
    })));
}

function mergeRequiredFacts(
  existing: readonly ApprovalEvidenceFact[],
  required: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  const fields = new Set(existing.map((fact) => fact.field));
  const missing = required.filter((fact) => !fields.has(fact.field));
  if (!missing.length) return existing;
  return Object.freeze([...existing, ...missing]);
}

function officialSourceIdentity(value: string): string {
  const canonicalUrl = canonicalizeApprovalEvidenceUrl(value);
  try {
    const url = new URL(canonicalUrl);
    const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
    if (host !== "law.go.kr") return canonicalUrl;

    const endpoint = url.pathname.split("/").filter(Boolean).at(-1)?.toLocaleLowerCase("en-US") ?? "";
    const article = queryValue(url, "lsJoLnkSeq");
    if (article) return `${host}:${endpoint}:lsJoLnkSeq=${article}`;
    const pattern = queryValue(url, "lspttninfSeq");
    if (pattern) return `${host}:${endpoint}:lspttninfSeq=${pattern}`;
    const interpretation = queryValue(url, "expcSeq");
    if (interpretation) return `${host}:${endpoint}:expcSeq=${interpretation}`;
    return canonicalUrl;
  } catch {
    return canonicalUrl;
  }
}

function queryValue(url: URL, name: string): string | undefined {
  const expected = name.toLocaleLowerCase("en-US");
  for (const [key, value] of url.searchParams) {
    if (key.toLocaleLowerCase("en-US") === expected && value.trim()) return value.trim();
  }
  return undefined;
}

function stableSourceId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const requiredClaimLabels: Readonly<Record<string, string>> = Object.freeze({
  continuingTransactionDefinition: "방문판매법상 계속거래의 법정 정의",
  continuingTransactionArticle30Threshold: "법 제30조 적용 금액·기간 기준",
  continuingTransactionContractDocument: "계속거래 계약서 발급 의무",
  excessiveTerminationPenalty: "손실을 현저히 초과하는 위약금 제한",
  excessPaymentRefund: "실제 공급 대가 초과분의 부당한 환급 거부 제한",
});

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
