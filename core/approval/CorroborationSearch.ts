import type { ApprovalEvidenceFact, ApprovalEvidenceSource } from "./ApprovalReadiness";

export type CorroborationSearchQuery = Readonly<{
  sourceId: string;
  query: string;
}>;

export type CorroborationCandidatePage = Readonly<{
  url: string;
  title: string;
  publisher: string;
  text: string;
  requestedUrl?: string;
  finalUrl?: string;
}>;

const maximumQueriesPerSource = 3;
const minimumRelevantTokens = 2;

/**
 * Builds free-web-search queries from the Claim already attached to an
 * unofficial Evidence source. This is deliberately deterministic: no second
 * LLM call is needed just to discover a corroborating page.
 *
 * Numeric tokens are removed from the query. The search query is only for
 * discovery; numeric/date equality is enforced separately when deciding
 * whether the fetched page actually supports the same content.
 */
export function buildCorroborationSearchQueries(
  source: ApprovalEvidenceSource,
): readonly CorroborationSearchQuery[] {
  const facts = source.matchedFacts?.length ? source.matchedFacts : source.facts;
  const title = cleanSearchText(source.title);
  const publisher = cleanSearchText(source.publisher);
  const queries: string[] = [];

  for (const fact of facts.slice(0, maximumQueriesPerSource)) {
    const value = cleanSearchText(fact.value);
    const field = cleanSearchText(fact.field.replace(/([a-z])([A-Z])/g, "$1 $2"));
    const query = [title, field, value].filter(Boolean).join(" ").trim();
    if (query.length >= 8) queries.push(query);
  }

  if (queries.length < maximumQueriesPerSource) {
    const fallback = [title, publisher, ...facts.slice(0, 2).map((fact) => cleanSearchText(fact.value))]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fallback.length >= 8) queries.push(fallback);
  }

  return Object.freeze(
    [...new Set(queries.map(normalizeWhitespace))]
      .slice(0, maximumQueriesPerSource)
      .map((query) => Object.freeze({ sourceId: source.sourceId, query })),
  );
}

/**
 * Returns exactly the Claims that a candidate page supports.
 *
 * A corroborating page must support the same content, not merely expose the
 * same fact field. Numeric/date tokens are therefore compared explicitly so
 * values such as "19세 이상" cannot corroborate "65세 이상". For textual
 * paraphrases, the remaining significant tokens must still substantially
 * overlap with the candidate page.
 */
export function corroborationSupportedFacts(
  page: CorroborationCandidatePage,
  facts: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  const haystack = normalizeForMatching(`${page.title} ${page.publisher} ${page.text}`);
  return Object.freeze(facts.filter((fact) => {
    const claim = normalizeForMatching(fact.value);
    if (claim.length >= 16 && haystack.includes(claim)) return true;

    const tokens = significantClaimTokens(fact.value);
    if (tokens.length < minimumRelevantTokens) return false;

    const numericTokens = tokens.filter((token) => /\d/iu.test(token));
    if (numericTokens.some((token) => !haystack.includes(token))) return false;

    const matched = tokens.filter((token) => haystack.includes(token));
    return matched.length >= minimumRelevantTokens
      && matched.length / tokens.length >= 0.75;
  }));
}

export function corroborationPageSupportsFacts(
  page: CorroborationCandidatePage,
  facts: readonly ApprovalEvidenceFact[],
): boolean {
  return corroborationSupportedFacts(page, facts).length > 0;
}

/**
 * Rejects obvious historical event/application pages. A current legal or
 * policy page is not rejected merely because it mentions an old amendment;
 * the exclusion targets pages that explicitly describe a completed event,
 * application window, or deadline in a past year.
 */
export function isLikelyStaleCorroborationPage(
  page: CorroborationCandidatePage,
  now: Date = new Date(),
): boolean {
  const haystack = `${page.title} ${page.publisher} ${page.text.slice(0, 6000)}`;
  const currentYear = now.getUTCFullYear();
  const years = [...haystack.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const hasPastYear = years.some((year) => year < currentYear - 1);
  if (!hasPastYear) return false;

  return /(?:행사|이벤트|접수|신청|모집|공모|지원|신청기간|접수기간|마감|종료|deadline|application period|event|recruitment)/iu.test(haystack);
}

function cleanSearchText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/https?:\/\/\S+/giu, " ")
      .replace(/\b20\d{2}\b/gu, " ")
      .replace(/\b\d+(?:\.\d+)?\s*(?:년|개월|일|주|원|만원|억원|%|퍼센트)\b/gu, " ")
      .replace(/\b\d+(?:\.\d+)?\b/gu, " "),
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeForMatching(value: string): string {
  return normalizeWhitespace(value.normalize("NFKC").toLocaleLowerCase("ko-KR"));
}

function significantClaimTokens(value: string): readonly string[] {
  const stopWords = new Set([
    "및", "또는", "에서", "으로", "에게", "대한", "관련", "경우", "따라", "위해",
    "있습니다", "있다", "합니다", "한다", "해야", "하여", "하는", "되는", "대해",
  ]);
  const tokens = new Set<string>();
  for (const match of normalizeForMatching(value).matchAll(/[가-힣A-Za-z0-9]{2,}/gu)) {
    const token = match[0];
    if (!stopWords.has(token)) tokens.add(token);
  }
  return Object.freeze([...tokens]);
}
