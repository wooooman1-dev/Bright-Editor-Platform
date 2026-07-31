import type { ContentOpportunitySelectionMode } from "./ContentOpportunity";

export type OwnedIdentityKeywordPolicyInput = Readonly<{
  ownedTerms: readonly string[];
  sourceRequest: string;
  selectionMode: ContentOpportunitySelectionMode;
  values: readonly string[];
}>;

/**
 * Finds Project/Brand identity labels that were inserted as keyword prefixes
 * even though the user did not choose that identity as the search subject.
 *
 * Automatic Planning never treats a Project/Brand label in a template request
 * as permission to use it as a search keyword. User-specified Planning may keep
 * the label only when the user explicitly included it in the request.
 */
export function findUnrequestedOwnedIdentityPrefixes(
  input: OwnedIdentityKeywordPolicyInput,
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
      return values.some((value) => hasOwnedIdentityPrefix(value, term));
    });
  return Object.freeze([...new Set(matches)]);
}

export function hasOwnedIdentityPrefix(value: string, ownedTerm: string): boolean {
  const normalizedValue = normalize(value);
  const normalizedTerm = normalize(ownedTerm);
  if (!normalizedValue || !normalizedTerm) return false;
  return new RegExp(`^${escapeRegExp(normalizedTerm)}(?:\\s+|\\s*[-–—:|·]\\s*)`, "iu")
    .test(normalizedValue);
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
