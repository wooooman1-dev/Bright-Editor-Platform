import type { ContentOpportunitySelectionMode } from "./ContentOpportunity";

export type OwnedIdentityKeywordPolicyInput = Readonly<{
  ownedTerms: readonly string[];
  sourceRequest: string;
  selectionMode: ContentOpportunitySelectionMode;
  values: readonly string[];
}>;

/**
 * Finds Project/Brand identity labels that were inserted as complete keywords
 * or keyword prefixes even though the user did not choose that identity as the
 * search subject.
 *
 * Automatic Planning never treats a Project/Brand label in a template request
 * as permission to use it as a search keyword. User-specified Planning may keep
 * the label only when the user explicitly included it in the request.
 */
export function findUnrequestedOwnedIdentityPrefixes(
  input: OwnedIdentityKeywordPolicyInput,
): readonly string[] {
  return findUnrequestedOwnedTerms(input, (value, term) => hasOwnedIdentityPrefix(value, term));
}

/**
 * Finds unrequested owned identity labels anywhere in generated editorial
 * output. This is intentionally broader than the Planning-prefix check because
 * a model can reinsert a Project/Brand label into titles, prose, metadata, ALT,
 * tags, or CTA labels even when the canonical keyword input was clean.
 */
export function findUnrequestedOwnedIdentityOccurrences(
  input: OwnedIdentityKeywordPolicyInput,
): readonly string[] {
  return findUnrequestedOwnedTerms(input, (value, term) =>
    normalize(value).toLocaleLowerCase("ko-KR")
      .includes(normalize(term).toLocaleLowerCase("ko-KR")));
}

export function hasOwnedIdentityPrefix(value: string, ownedTerm: string): boolean {
  const normalizedValue = normalize(value);
  const normalizedTerm = normalize(ownedTerm);
  if (!normalizedValue || !normalizedTerm) return false;
  const comparisonValue = normalizedValue.toLocaleLowerCase("ko-KR");
  const comparisonTerm = normalizedTerm.toLocaleLowerCase("ko-KR");
  if (comparisonValue === comparisonTerm) return true;
  return new RegExp(`^${escapeRegExp(normalizedTerm)}(?:\\s+|\\s*[-–—:|·]\\s*)`, "iu")
    .test(normalizedValue);
}

function findUnrequestedOwnedTerms(
  input: OwnedIdentityKeywordPolicyInput,
  matchesValue: (value: string, term: string) => boolean,
): readonly string[] {
  const request = normalize(input.sourceRequest).toLocaleLowerCase("ko-KR");
  const values = input.values.map(normalize).filter(Boolean);
  const matches = input.ownedTerms
    .map(normalize)
    .filter(Boolean)
    .filter((term) => {
      const explicitlyRequested = input.selectionMode === "userSpecified"
        && request.includes(term.toLocaleLowerCase("ko-KR"));
      if (explicitlyRequested) return false;
      return values.some((value) => matchesValue(value, term));
    });
  return Object.freeze([...new Set(matches)]);
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
