import type { ContentDocument } from "../content";
import type {
  ApprovalEvidenceFact,
  ApprovalEvidencePack,
  ApprovalEvidenceSource,
} from "./ApprovalReadiness";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";

export type ApprovalSourcePage = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  title: string;
  publisher: string;
  text: string;
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
 * active profile's official-source trust policy, and at least one factual value
 * extracted from the canonical document is also present on the source page.
 * A URL, title, or citation label by itself is never enough.
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

  const facts = extractApprovalFacts(document);
  const pagesByRequestedUrl = new Map(pages.map((page) => [normalizeUrl(page.requestedUrl), page]));
  const reasons: string[] = [];
  let verifiedSourceCount = 0;

  const sources = existing.sources.map((source) => {
    const page = pagesByRequestedUrl.get(normalizeUrl(source.url));
    if (!page) {
      reasons.push(`${source.url}: 출처 페이지를 불러오지 못했습니다.`);
      return unverifiedSource(source);
    }
    if (!sourcePageReachable(page)) {
      reasons.push(`${source.url}: HTTPS 공개 페이지로 정상 응답하지 않았습니다.`);
      return unverifiedSource(source, page);
    }
    if (!officialSourceAllowed(profileId, page)) {
      reasons.push(`${source.url}: 적용 프로필의 공식 출처로 확인되지 않았습니다.`);
      return unverifiedSource(source, page);
    }

    const matchedFacts = facts.filter((fact) => pageContainsFact(page, fact));
    if (!matchedFacts.length) {
      reasons.push(`${source.url}: 원고의 작품·제도 사실과 공식 페이지의 일치를 확인하지 못했습니다.`);
      return unverifiedSource(source, page);
    }

    verifiedSourceCount += 1;
    return Object.freeze({
      ...source,
      url: page.finalUrl,
      title: page.title || source.title,
      publisher: page.publisher || source.publisher,
      retrievedAt: reviewedAt,
      verified: true,
      facts: Object.freeze(matchedFacts),
    } satisfies ApprovalEvidenceSource);
  });

  const verified = sources.length > 0 && sources.every((source) => source.verified);
  const pack: ApprovalEvidencePack = Object.freeze({
    version: "1.0",
    status: verified ? "verified" : "needs_review",
    ...(verified ? { reviewedAt } : {}),
    sources: Object.freeze(sources),
  });

  return Object.freeze({
    pack,
    verifiedSourceCount,
    rejectedSourceCount: sources.length - verifiedSourceCount,
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
      const value = cleanFactValue(match[1] ?? "");
      if (value.length < 2) continue;
      found.set(`${field}:${normalizeFact(value)}`, Object.freeze({ field, value }));
    }
  }

  for (const year of text.matchAll(/\b(?:1[3-9]\d{2}|20\d{2})\b/g)) {
    const value = year[0];
    found.set(`yearSignal:${value}`, Object.freeze({ field: "yearSignal", value }));
  }
  for (const dimensions of text.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:×|x|X)\s*\d+(?:[.,]\d+)?(?:\s*(?:cm|㎝|mm|m))?/g)) {
    const value = cleanFactValue(dimensions[0]);
    found.set(`dimensionSignal:${normalizeFact(value)}`, Object.freeze({ field: "dimensionSignal", value }));
  }

  return Object.freeze([...found.values()].slice(0, 24));
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

  const institutionalText = normalizeFact(`${host} ${page.title} ${page.publisher} ${page.text.slice(0, 5000)}`);
  const hasInstitutionSignal = vivaRainInstitutionSignals.some((signal) => institutionalText.includes(normalizeFact(signal)));
  const hasInstitutionalDomain = /(?:museum|musee|gallery|gallerie|kunst|archive|foundation|collection|artinstitut|nga|moma|metmuseum|tate|rijksmuseum)/i.test(host);
  return hasInstitutionSignal && (hasInstitutionalDomain || host.endsWith(".org") || host.endsWith(".edu") || host.endsWith(".ac.kr"));
}

function sourcePageReachable(page: ApprovalSourcePage): boolean {
  return page.status >= 200
    && page.status < 400
    && page.finalUrl.startsWith("https://")
    && /(?:text\/html|application\/xhtml\+xml)/i.test(page.contentType)
    && page.text.trim().length >= 200;
}

function pageContainsFact(page: ApprovalSourcePage, fact: ApprovalEvidenceFact): boolean {
  const needle = normalizeFact(fact.value);
  if (needle.length < 3) return false;
  const haystack = normalizeFact(`${page.title} ${page.publisher} ${page.text}`);
  return haystack.includes(needle);
}

function unverifiedSource(source: ApprovalEvidenceSource, page?: ApprovalSourcePage): ApprovalEvidenceSource {
  return Object.freeze({
    ...source,
    ...(page?.finalUrl ? { url: page.finalUrl } : {}),
    ...(page?.title ? { title: page.title } : {}),
    ...(page?.publisher ? { publisher: page.publisher } : {}),
    verified: false,
    facts: Object.freeze([]),
  });
}

function documentText(document: ContentDocument): string {
  return [
    document.title,
    ...document.blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") return [block.text];
      if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
      if (block.type === "button") return [block.label, block.targetUrl];
      if (block.type === "image") return [block.alt, block.prompt ?? ""];
      return [];
    }),
  ].join("\n");
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

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

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
