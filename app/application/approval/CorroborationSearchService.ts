import {
  buildCorroborationSearchQueries,
  buildMissingApprovalFactSearchQueries,
  corroborationSupportedFacts,
  isLikelyStaleCorroborationPage,
  type CorroborationCandidatePage,
} from "../../../core/approval/CorroborationSearch";
import type {
  ApprovalEvidenceFact,
  ApprovalEvidenceSource,
} from "../../../core/approval/ApprovalReadiness";
import { approvalCompatibleSourceId, canonicalizeVerificationSourceIdentity } from "../../../core/approval/VerificationSourceIdentity";
import type { SiteApprovalReadinessFetch } from "../../../core/approval";
import { canonicalizeApprovalEvidenceUrl } from "../../../core/approval";
import type { ApprovalSearchProvider } from "../../../core/ai/ApprovalSourcePreflight";

export type CorroborationSearchResult = Readonly<{
  sourceId: string;
  candidates: readonly CorroborationSearchCandidate[];
  searchedQueries: readonly string[];
}>;

export type CorroborationSearchCandidate = Readonly<{
  sourceId: string;
  originalSourceId: string;
  url: string;
  title: string;
  publisher: string;
  page: CorroborationCandidatePage;
  facts: readonly ApprovalEvidenceFact[];
  institutionGroupId: string;
}>;

export type MissingApprovalFactSearchResult = Readonly<{
  field: string;
  candidates: readonly MissingApprovalFactSearchCandidate[];
  searchedQueries: readonly string[];
}>;

export type MissingApprovalFactSearchCandidate = Readonly<{
  sourceId: string;
  url: string;
  title: string;
  publisher: string;
  page: CorroborationCandidatePage;
  facts: readonly ApprovalEvidenceFact[];
}>;

const maximumResultsPerQuery = 5;
const maximumCandidatesPerSource = 6;
const maximumCandidatesPerMissingFact = 4;

/**
 * Performs one deterministic, no-API-key web search pass for each unofficial
 * source that needs corroboration. DuckDuckGo's no-JS HTML endpoint is used so
 * this stage does not add a paid search API or another LLM call.
 *
 * Corroboration requires a different institution group. A different URL from
 * the same institution is not an independent corroborating source.
 */
export async function searchCorroborationCandidates(
  source: ApprovalEvidenceSource,
  fetcher: SiteApprovalReadinessFetch,
  now = new Date(),
  searchProvider?: ApprovalSearchProvider,
): Promise<CorroborationSearchResult> {
  const queries = buildCorroborationSearchQueries(source);
  const searchedQueries: string[] = [];
  const candidates: CorroborationSearchCandidate[] = [];
  const seenUrls = new Set<string>();
  const originalIdentity = canonicalizeVerificationSourceIdentity({
    requestedUrl: source.url,
    finalUrl: source.finalUrl,
    publisherId: source.publisher,
    role: "primaryOfficial",
    authoritative: source.official === true,
  });

  for (const { query } of queries) {
    searchedQueries.push(query);
    const results = await searchDuckDuckGo(query, fetcher, searchProvider);
    for (const result of results) {
      if (candidates.length >= maximumCandidatesPerSource) break;
      const canonicalUrl = canonicalizeApprovalEvidenceUrl(result.url);
      if (!canonicalUrl || seenUrls.has(canonicalUrl)) continue;
      seenUrls.add(canonicalUrl);
      if (canonicalUrl === canonicalizeApprovalEvidenceUrl(source.url)) continue;

      const page = await fetchCandidatePage(canonicalUrl, fetcher);
      if (!page) continue;
      if (isLikelyStaleCorroborationPage(page, now)) continue;
      const facts = source.matchedFacts?.length ? source.matchedFacts : source.facts;
      const supportedFacts = corroborationSupportedFacts(page, facts);
      if (!supportedFacts.length) continue;

      const identity = canonicalizeVerificationSourceIdentity({
        requestedUrl: canonicalUrl,
        finalUrl: page.finalUrl,
        publisherId: page.publisher,
        role: "independentCorroborating",
        authoritative: false,
      });
      if (!identity) continue;
      if (originalIdentity && identity.institutionGroupId === originalIdentity.institutionGroupId) continue;

      candidates.push(Object.freeze({
        sourceId: approvalCompatibleSourceId(canonicalUrl),
        originalSourceId: source.sourceId,
        url: canonicalUrl,
        title: page.title || result.title,
        publisher: page.publisher || result.publisher,
        page,
        facts: Object.freeze(supportedFacts),
        institutionGroupId: identity.institutionGroupId,
      }));
    }
    if (candidates.length >= maximumCandidatesPerSource) break;
  }

  return Object.freeze({
    sourceId: source.sourceId,
    candidates: Object.freeze(candidates),
    searchedQueries: Object.freeze(searchedQueries),
  });
}

/**
 * Searches only for the fact fields that the current Evidence pack left
 * uncovered. This is a deterministic/free repair pass used after the initial
 * official-source verification. Candidate acceptance is still decided by the
 * Core verifier, so a search hit can never by itself mark a Claim verified.
 */
export async function searchMissingApprovalFactCandidates(
  facts: readonly ApprovalEvidenceFact[],
  fetcher: SiteApprovalReadinessFetch,
  now = new Date(),
  searchProvider?: ApprovalSearchProvider,
): Promise<readonly MissingApprovalFactSearchResult[]> {
  const queries = buildMissingApprovalFactSearchQueries(facts);
  const byField = new Map<string, MissingApprovalFactSearchResult>();
  const seenUrlsByField = new Map<string, Set<string>>();

  for (const { field, query } of queries) {
    const current = byField.get(field) ?? {
      field,
      candidates: Object.freeze([]),
      searchedQueries: Object.freeze([]),
    };
    const searchedQueries = [...current.searchedQueries, query];
    const candidates = [...current.candidates];
    const seenUrls = seenUrlsByField.get(field) ?? new Set<string>();
    seenUrlsByField.set(field, seenUrls);
    const results = await searchDuckDuckGo(query, fetcher, searchProvider);
    for (const result of results) {
      if (candidates.length >= maximumCandidatesPerMissingFact) break;
      const canonicalUrl = canonicalizeApprovalEvidenceUrl(result.url);
      if (!canonicalUrl || seenUrls.has(canonicalUrl)) continue;
      seenUrls.add(canonicalUrl);
      const page = await fetchCandidatePage(canonicalUrl, fetcher);
      if (!page || isLikelyStaleCorroborationPage(page, now)) continue;
      const fact = facts.find((item) => item.field === field);
      if (!fact) continue;
      const supportedFacts = corroborationSupportedFacts(page, [fact]);
      if (!supportedFacts.length) continue;
      candidates.push(Object.freeze({
        sourceId: approvalCompatibleSourceId(canonicalUrl),
        url: canonicalUrl,
        title: page.title || result.title,
        publisher: page.publisher || result.publisher,
        page,
        facts: Object.freeze(supportedFacts),
      }));
    }
    byField.set(field, Object.freeze({
      field,
      candidates: Object.freeze(candidates),
      searchedQueries: Object.freeze(searchedQueries),
    }));
  }

  return Object.freeze([...byField.values()]);
}

type SearchResult = Readonly<{
  title: string;
  publisher: string;
  url: string;
}>;

async function searchDuckDuckGo(
  query: string,
  fetcher: SiteApprovalReadinessFetch,
  fallbackProvider?: ApprovalSearchProvider,
): Promise<readonly SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.6",
        "user-agent": "Mozilla/5.0 (compatible; BrightEditor/1.0; +https://bright-editor.local)",
      },
    });
    if (!response.ok) {
      return fallbackProviderResults(query, fetcher, fallbackProvider);
    }
    const html = await response.text();
    const results = parseDuckDuckGoResults(html).slice(0, maximumResultsPerQuery);
    return results.length ? Object.freeze(results) : fallbackProviderResults(query, fetcher, fallbackProvider);
  } catch {
    return fallbackProviderResults(query, fetcher, fallbackProvider);
  }
}

async function fallbackProviderResults(
  query: string,
  fetcher: SiteApprovalReadinessFetch,
  provider?: ApprovalSearchProvider,
): Promise<readonly SearchResult[]> {
  if (!provider) return Object.freeze([]);
  try {
    const urls = await provider.search(query, fetcher);
    return Object.freeze(urls.slice(0, maximumResultsPerQuery).map((url) => Object.freeze({
      url,
      title: "",
      publisher: (() => { try { return new URL(url).hostname.replace(/^www\./iu, ""); } catch { return ""; } })(),
    })));
  } catch {
    return Object.freeze([]);
  }
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const resultPattern = /<a[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu;
  let match: RegExpExecArray | null;
  while ((match = resultPattern.exec(html)) !== null) {
    const rawUrl = decodeHtmlEntities(match[1] ?? "");
    const title = stripHtml(decodeHtmlEntities(match[2] ?? ""));
    const url = unwrapDuckDuckGoUrl(rawUrl);
    if (!url || !/^https:\/\//iu.test(url) || !title) continue;
    let publisher = "";
    try { publisher = new URL(url).hostname.replace(/^www\./iu, ""); } catch { /* ignore malformed result */ }
    results.push(Object.freeze({ title, publisher, url }));
  }
  return results;
}

async function fetchCandidatePage(
  url: string,
  fetcher: SiteApprovalReadinessFetch,
): Promise<CorroborationCandidatePage | undefined> {
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.6",
        "user-agent": "Mozilla/5.0 (compatible; BrightEditor/1.0; +https://bright-editor.local)",
      },
    });
    const finalUrl = response.url || url;
    if (!response.ok || !/^https:\/\//iu.test(finalUrl)) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (!/(?:text\/html|application\/xhtml\+xml|text\/plain)/iu.test(contentType)) return undefined;
    const text = await response.text();
    const title = extractTitle(text);
    const bodyText = stripHtml(text).slice(0, 100_000);
    return Object.freeze({
      url,
      title,
      publisher: new URL(finalUrl).hostname.replace(/^www\./iu, ""),
      text: bodyText,
      finalUrl,
    });
  } catch {
    return undefined;
  }
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
  return stripHtml(decodeHtmlEntities(match?.[1] ?? "")).slice(0, 300).trim();
}

function unwrapDuckDuckGoUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const encoded = url.searchParams.get("uddg");
    return encoded ? decodeURIComponent(encoded) : url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}
