import type { ContentDocument } from "../content";
import type {
  ApprovalEvidenceFact,
  ApprovalEvidencePack,
  ApprovalEvidenceSource,
  ApprovalEvidenceVerificationStatus,
} from "./ApprovalReadiness";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import {
  approvalFactMatchesPage,
  extractProfileApprovalFacts,
  requiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicy";

export type ApprovalSourcePage = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  title: string;
  publisher: string;
  text: string;
  fetchError?: string;
}>;

export type ApprovalEvidenceVerificationResult = Readonly<{
  pack: ApprovalEvidencePack;
  verifiedSourceCount: number;
  rejectedSourceCount: number;
  reasons: readonly string[];
}>;

/**
 * Verifies approval Evidence without another AI call.
 *
 * A source is marked verified only when it is reachable over HTTPS, matches the
 * active profile's official-source trust policy, and multiple factual values
 * extracted from the canonical document are also present on the source page.
 * Duplicate, unreachable, unsupported, unofficial, and mismatched candidates
 * remain in the Evidence Pack with deterministic diagnostics.
 */
export function verifyApprovalEvidence(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
  pages: readonly ApprovalSourcePage[],
  reviewedAt: string,
): ApprovalEvidenceVerificationResult {
  const existing = document.metadata?.approvalEvidence;
  if (!existing?.sources.length) {
    return Object.freeze({
      pack: Object.freeze({ version: "1.0", status: "missing", sources: Object.freeze([]) }),
      verifiedSourceCount: 0,
      rejectedSourceCount: 0,
      reasons: Object.freeze(["검증할 공식 출처 후보가 없습니다."]),
    });
  }

  const baseFacts = extractProfileApprovalFacts(document, profileId);
  const requiredFactFields = requiredApprovalFactFields(document, profileId, baseFacts);
  const verifiedFactFields = new Set<string>();
  const pagesByCanonicalUrl = new Map<string, ApprovalSourcePage>();
  for (const page of pages) {
    const requested = canonicalizeApprovalEvidenceUrl(page.requestedUrl);
    const final = canonicalizeApprovalEvidenceUrl(page.finalUrl);
    if (!pagesByCanonicalUrl.has(requested)) pagesByCanonicalUrl.set(requested, page);
    if (!pagesByCanonicalUrl.has(final)) pagesByCanonicalUrl.set(final, page);
  }

  const reasons: string[] = [];
  const seenCanonicalUrls = new Set<string>();
  let verifiedSourceCount = 0;

  const sources = existing.sources.map((source) => {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.url);
    if (seenCanonicalUrls.has(canonicalUrl)) {
      const reason = `${source.url}: 동일한 canonical 출처가 이미 검사되어 중복 후보에서 제외했습니다.`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "duplicate_source", reason, {
        canonicalUrl,
        selected: false,
      });
    }
    seenCanonicalUrls.add(canonicalUrl);

    const page = pagesByCanonicalUrl.get(canonicalUrl);
    if (!page) {
      const reason = `${source.url}: 출처 페이지를 불러오지 못했습니다.`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "unreachable", reason, {
        canonicalUrl,
        selected: false,
      });
    }

    const pageDetails = {
      canonicalUrl,
      finalUrl: page.finalUrl,
      httpStatus: page.status,
      contentType: page.contentType,
    } as const;

    if (page.fetchError) {
      const reason = `${source.url}: 출처 페이지 요청이 실패했습니다. ${page.fetchError}`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "unreachable", reason, {
        ...pageDetails,
        official: false,
        selected: false,
      }, page);
    }

    if (!sourcePageProtocolAndStatusValid(page)) {
      const reason = `${source.url}: HTTPS 공개 페이지로 정상 응답하지 않았습니다 (HTTP ${page.status}, ${page.contentType || "content-type 없음"}).`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "unreachable", reason, {
        ...pageDetails,
        selected: false,
      }, page);
    }

    const official = officialSourceAllowed(profileId, page);
    if (!isSupportedHtmlPage(page)) {
      const reason = `${source.url}: 현재 Evidence 검증에서 지원하지 않는 콘텐츠 형식입니다 (${page.contentType || "content-type 없음"}).`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "unsupported_content_type", reason, {
        ...pageDetails,
        official,
        selected: false,
      }, page);
    }

    if (page.text.trim().length < 200) {
      const reason = `${source.url}: 공개 페이지 본문이 너무 짧아 사실 대조를 수행하지 못했습니다.`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "unreachable", reason, {
        ...pageDetails,
        official,
        selected: false,
      }, page);
    }

    if (!official) {
      const reason = `${source.url}: 적용 프로필의 공식 출처로 확인되지 않았습니다.`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "unofficial_source", reason, {
        ...pageDetails,
        official: false,
        selected: false,
      }, page);
    }

    const sourceFacts = mergeApprovalFacts(
      baseFacts,
      extractApprovalCitationFacts(document, canonicalUrl),
    );
    const matchedFacts = sourceFacts.filter((fact) => approvalFactMatchesPage(page, fact));
    const matchedValues = new Set(matchedFacts.map((fact) => canonicalFactValue(fact.value)));
    if (matchedValues.size < 2) {
      const reason = `${source.url}: 원고의 서로 다른 작품·제도 사실 2개 이상과 공식 페이지의 일치를 확인하지 못했습니다.`;
      reasons.push(reason);
      return diagnosticSource(source, reviewedAt, "fact_mismatch", reason, {
        ...pageDetails,
        official: true,
        selected: false,
        matchedFacts: Object.freeze(matchedFacts),
      }, page);
    }

    verifiedSourceCount += 1;
    for (const fact of matchedFacts) verifiedFactFields.add(fact.field);
    return Object.freeze({
      ...source,
      title: page.title || source.title,
      publisher: page.publisher || source.publisher,
      retrievedAt: reviewedAt,
      verified: true,
      facts: Object.freeze(matchedFacts),
      canonicalUrl,
      finalUrl: page.finalUrl,
      httpStatus: page.status,
      contentType: page.contentType,
      official: true,
      selected: true,
      verificationStatus: "verified" as const,
      matchedFacts: Object.freeze(matchedFacts),
      checkedAt: reviewedAt,
    } satisfies ApprovalEvidenceSource);
  });

  const unverifiedFactFields = requiredFactFields.filter((field) => !verifiedFactFields.has(field));
  if (unverifiedFactFields.length) {
    reasons.push(`핵심 Claim 검증이 완료되지 않았습니다: ${unverifiedFactFields.join(", ")}`);
  }
  const verified = verifiedSourceCount > 0 && unverifiedFactFields.length === 0;
  const pack: ApprovalEvidencePack = Object.freeze({
    version: "1.0",
    status: verified ? "verified" : "needs_review",
    ...(verified ? { reviewedAt } : {}),
    requiredFactFields: Object.freeze([...requiredFactFields]),
    verifiedFactFields: Object.freeze([...verifiedFactFields]),
    unverifiedFactFields: Object.freeze(unverifiedFactFields),
    sources: Object.freeze(sources),
  });

  return Object.freeze({
    pack,
    verifiedSourceCount,
    rejectedSourceCount: sources.filter((source) =>
      !source.verified
      && source.verificationStatus !== "excluded").length,
    reasons: Object.freeze(reasons),
  });
}

export function extractApprovalFacts(document: ContentDocument): readonly ApprovalEvidenceFact[] {
  const text = documentText(document);
  const found = new Map<string, ApprovalEvidenceFact>();
  const patterns: readonly Readonly<{ field: string; pattern: RegExp }>[] = [
    { field: "artworkTitle", pattern: /(?:작품명|작품 제목)\s*[:：]\s*([^\n|]{2,120})/gi },
    { field: "creationYear", pattern: /(?:제작\s*(?:연도|년도)|연도)\s*[:：]\s*((?:1[3-9]\d{2}|20\d{2})(?:년)?)/gi },
    { field: "medium", pattern: /(?:재료|기법)\s*[:：]\s*([^\n|]{2,120})/gi },
    { field: "dimensions", pattern: /(?:크기|규격)\s*[:：]\s*([^\n|]{2,120})/gi },
    { field: "holdingInstitution", pattern: /(?:소장처|소장\s*기관)\s*[:：]\s*([^\n|]{2,160})/gi },
    { field: "eligibility", pattern: /(?:지원\s*대상|신청\s*대상|적용\s*대상)\s*[:：]\s*([^\n|]{2,200})/gi },
    { field: "amount", pattern: /(?:지원\s*금액|금액|한도)\s*[:：]\s*([^\n|]{2,120})/gi },
    { field: "period", pattern: /(?:신청\s*기간|적용\s*기간|기간)\s*[:：]\s*([^\n|]{2,160})/gi },
  ];

  for (const { field, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      addApprovalFact(found, field, match[1] ?? "");
    }
  }

  for (const year of text.matchAll(/\b(?:1[3-9]\d{2}|20\d{2})\b/g)) {
    addApprovalFact(found, "yearSignal", year[0]);
  }
  for (const dimensions of text.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:×|x|X)\s*\d+(?:[.,]\d+)?(?:\s*(?:cm|㎝|mm|m))?/g)) {
    addApprovalFact(found, "dimensionSignal", dimensions[0]);
  }

  return Object.freeze([...found.values()].slice(0, 24));
}

/**
 * Extracts only the bibliographic facts attached to one canonical source URL.
 * This prevents an institution, artwork, or author from a different source line
 * from being used to verify the current candidate.
 */
export function extractApprovalCitationFacts(
  document: ContentDocument,
  sourceUrl: string,
): readonly ApprovalEvidenceFact[] {
  const canonicalSourceUrl = canonicalizeApprovalEvidenceUrl(sourceUrl);
  const found = new Map<string, ApprovalEvidenceFact>();

  for (const blockText of documentBlockTexts(document)) {
    for (const line of blockText.split(/\r?\n/g)) {
      const trimmed = line.trim();
      if (!/^(?:[-*•]|\d+[.)])\s+/.test(trimmed)) continue;

      for (const match of trimmed.matchAll(/https:\/\/[^\s)\]]+/gi)) {
        const rawUrl = trimCitationUrl(match[0]);
        if (canonicalizeApprovalEvidenceUrl(rawUrl) !== canonicalSourceUrl) continue;

        const prefix = trimmed.slice(0, match.index ?? 0);
        const label = cleanCitationLabel(prefix);
        if (!label) continue;
        addCitationLabelFacts(found, label, trimmed);
      }
    }
  }

  return Object.freeze([...found.values()].slice(0, 12));
}

export function officialSourceAllowed(
  profileId: ApprovalPolicyProfileId,
  page: ApprovalSourcePage,
): boolean {
  let host: string;
  try {
    host = new URL(page.finalUrl).hostname.toLocaleLowerCase("en-US");
  } catch {
    return false;
  }

  if (profileId === "wordpress_life_economy_v1") {
    return wordpressOfficialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  if (vivaRainDeniedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
  if (host.endsWith(".museum") || host.endsWith(".gov") || host.endsWith(".go.kr")) return true;
  if (vivaRainOfficialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;

  const institutionalText = normalizeFact(`${host} ${page.title} ${page.publisher} ${page.text.slice(0, 5000)}`);
  const hasInstitutionSignal = vivaRainInstitutionSignals.some((signal) => institutionalText.includes(normalizeFact(signal)));
  const hasInstitutionalDomain = /(?:museum|musee|gallery|gallerie|kunst|archive|foundation|collection|artinstitut|nga|moma|metmuseum|tate|rijksmuseum|getty)/i.test(host);
  return hasInstitutionSignal && (hasInstitutionalDomain || host.endsWith(".org") || host.endsWith(".edu") || host.endsWith(".ac.kr"));
}

export function canonicalizeApprovalEvidenceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameter(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/g, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

function diagnosticSource(
  source: ApprovalEvidenceSource,
  checkedAt: string,
  verificationStatus: ApprovalEvidenceVerificationStatus,
  failureReason: string,
  details: Readonly<{
    canonicalUrl?: string;
    finalUrl?: string;
    httpStatus?: number;
    contentType?: string;
    official?: boolean;
    selected?: boolean;
    matchedFacts?: readonly ApprovalEvidenceFact[];
  }>,
  page?: ApprovalSourcePage,
): ApprovalEvidenceSource {
  return Object.freeze({
    ...source,
    ...(page?.title ? { title: page.title } : {}),
    ...(page?.publisher ? { publisher: page.publisher } : {}),
    verified: false,
    facts: Object.freeze([]),
    ...details,
    verificationStatus,
    failureReason,
    checkedAt,
  });
}

function sourcePageProtocolAndStatusValid(page: ApprovalSourcePage): boolean {
  return page.status >= 200
    && page.status < 400
    && page.finalUrl.startsWith("https://");
}

function isSupportedHtmlPage(page: ApprovalSourcePage): boolean {
  return /(?:text\/html|application\/xhtml\+xml)/i.test(page.contentType);
}


function factVariants(value: string): readonly string[] {
  const raw = value.normalize("NFKC");
  const variants = [
    raw,
    raw.replace(/(\d{4})\s*년/g, "$1"),
    raw.replace(/센티미터|㎝/g, "cm").replace(/밀리미터/g, "mm"),
  ].map(normalizeFact).filter(Boolean);
  return Object.freeze([...new Set(variants)]);
}

function canonicalFactValue(value: string): string {
  return factVariants(value)[0] ?? normalizeFact(value);
}

function mergeApprovalFacts(
  first: readonly ApprovalEvidenceFact[],
  second: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  const found = new Map<string, ApprovalEvidenceFact>();
  for (const fact of [...first, ...second]) {
    const key = `${fact.field}:${normalizeFact(fact.value)}`;
    if (!found.has(key)) found.set(key, fact);
  }
  return Object.freeze([...found.values()]);
}

function addCitationLabelFacts(
  found: Map<string, ApprovalEvidenceFact>,
  label: string,
  excerpt: string,
): void {
  const institutionAndWork = /^([^,]{2,160}),\s*(.+)$/i.exec(label);
  if (!institutionAndWork) return;

  const institution = institutionAndWork[1] ?? "";
  const workAndArtist = institutionAndWork[2] ?? "";
  const byArtist = /^(.+?)\s+by\s+(.+)$/i.exec(workAndArtist);

  addApprovalFact(found, "holdingInstitution", institution, excerpt);
  if (byArtist) {
    addApprovalFact(found, "artworkTitle", byArtist[1] ?? "", excerpt);
    addApprovalFact(found, "artist", byArtist[2] ?? "", excerpt);
    return;
  }
  addApprovalFact(found, "artworkTitle", workAndArtist, excerpt);
}

function addApprovalFact(
  found: Map<string, ApprovalEvidenceFact>,
  field: string,
  rawValue: string,
  excerpt?: string,
): void {
  const value = cleanFactValue(rawValue);
  if (value.length < 2) return;
  const key = `${field}:${normalizeFact(value)}`;
  if (!found.has(key)) {
    found.set(key, Object.freeze({
      field,
      value,
      ...(excerpt ? { excerpt } : {}),
    }));
  }
}

function cleanCitationLabel(value: string): string {
  return value
    .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/[\s:：]+$/g, "")
    .replace(/^\[|\]\($/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimCitationUrl(value: string): string {
  return value.replace(/[.,;:]+$/g, "");
}

function documentText(document: ContentDocument): string {
  return [document.title, ...documentBlockTexts(document)].join("\n");
}

function documentBlockTexts(document: ContentDocument): readonly string[] {
  return Object.freeze(document.blocks.flatMap((block) => {
    if (block.type === "heading" || block.type === "paragraph") return [block.text];
    if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
    if (block.type === "button") return [block.label, block.targetUrl];
    if (block.type === "image") return [block.alt, block.prompt ?? ""];
    return [];
  }));
}

function cleanFactValue(value: string): string {
  return value.replace(/https:\/\/\S+/gi, "").replace(/\s+/g, " ").replace(/[.;,]+$/g, "").trim();
}

function normalizeFact(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function trackingParameter(value: string): boolean {
  return /^utm_/i.test(value) || trackingParameters.has(value.toLocaleLowerCase("en-US"));
}

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

const wordpressOfficialDomains = Object.freeze([
  "gov.kr",
  "go.kr",
  "korea.kr",
  "law.go.kr",
  "nts.go.kr",
  "fsc.go.kr",
  "fss.or.kr",
  "bok.or.kr",
  "molit.go.kr",
  "moel.go.kr",
  "mohw.go.kr",
  "mois.go.kr",
  "lh.or.kr",
  "hf.go.kr",
  "nhuf.molit.go.kr",
]);

const vivaRainDeniedDomains = Object.freeze([
  "wikipedia.org",
  "namu.wiki",
  "tistory.com",
  "blog.naver.com",
  "medium.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "pinterest.com",
]);

const vivaRainOfficialDomains = Object.freeze([
  "metmuseum.org",
  "nga.gov",
  "getty.edu",
  "moma.org",
  "tate.org.uk",
  "rijksmuseum.nl",
  "artic.edu",
  "guggenheim.org",
  "louvre.fr",
  "musee-orsay.fr",
]);

const vivaRainInstitutionSignals = Object.freeze([
  "museum",
  "musee",
  "미술관",
  "박물관",
  "national gallery",
  "collection",
  "official archive",
  "foundation",
  "재단",
  "공식 아카이브",
  "art institute",
]);