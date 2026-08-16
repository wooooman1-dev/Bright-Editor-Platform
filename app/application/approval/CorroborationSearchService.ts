import {
  buildCorroborationSearchQueries,
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

const maximumResultsPerQuery = 5;
const maximumCandidatesPerSource = 6;

/**
 * Performs one deterministic, no-API-key web search pass for each unofficial
 * source that needs corroboration. DuckDuckGo's no-JS HTML endpoint is used so
 * this stage does not add a paid search API or another LLM call.
 */
export async function searchCorroborationCandidates(
  source: ApprovalEvidenceSource,
  fetcher: SiteApprovalReadinessFetch,
  now = new Date(),
): Promise<CorroborationSearchResult> {
  const queries = buildCorroborationSearchQueries(source);
  const searchedQueries: string[] = [];
  const candidates: CorroborationSearchCandidate[] = [];
  const seenUrls = new Set<string>();
  const originalIdentity = canonicalizeVerificationSourceIdentity({
    requestedUrl: source.url,
    finalUrl: source.finalUrl,
    publisherId: source.publisher,
    role: "independentCorroborating",
    authoritative: false,
  });

  for (const { query } of queries) {
    searchedQueries.push(query);
    const results = await searchDuckDuckGo(query, fetcher);
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

type SearchResult = Readonly<{
  title: string;
  publisher: string;
  url: string;
}>;

async function searchDuckDuckGo(
  query: string,
  fetcher: SiteApprovalReadinessFetch,
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
    if (!response.ok) return Object.freeze([]);
    const html = await response.text();
    return Object.freeze(parseDuckDuckGoResults(html).slice(0, maximumResultsPerQuery));
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
