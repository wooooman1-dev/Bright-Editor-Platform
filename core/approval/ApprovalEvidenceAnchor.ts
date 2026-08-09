/**
 * Canonical verbatim-anchor text comparison for Approval Evidence.
 *
 * Source Preflight verifies the same untrusted excerpt against the same fetched
 * page twice: once as a source-level anchor and once as a Claim-level evidence
 * binding. Those two gates must apply identical canonicalization. When they
 * diverged, a page could pass officialness, relevance, and the source anchor,
 * be admitted as the Claim's primary official source, and then have its Claim
 * silently rejected as `claim_evidence_excerpt_not_found`, ending the run at
 * `coverage_incomplete` with no actionable reason. This module owns the single
 * canonical form so that divergence cannot reappear.
 */

/**
 * Korean statute pages inline revision-history annotations such as
 * "<개정 2019. 1. 15., 2019. 8. 27.>" between an intro clause and its enumerated
 * sub-items. The annotation is pure citation metadata, so a verbatim quote that
 * omits it is still contiguous source text. Stripping it from both the page and
 * the excerpt keeps the comparison symmetric: a quote matches whether or not the
 * provider chose to carry the annotation across.
 */
export function stripEvidenceAnnotations(value: string): string {
  return value.replace(/<(?:개정|신설|전문개정|일부개정|타법개정)[^<>]{0,300}>/gu, " ");
}

/**
 * Reduces text to the comparable core: annotations removed, then everything
 * except digits, ASCII letters, and precomposed Hangul syllables discarded.
 * Whitespace, punctuation, and the parenthetical hanja glosses that Korean
 * statutes attach to Hangul terms all collapse away, so formatting differences
 * between a fetched document and a quoted passage cannot break an honest quote.
 */
export function canonicalEvidenceAnchorText(value: string): string {
  return stripEvidenceAnnotations(value.normalize("NFKC"))
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]+/gu, "")
    .trim();
}

/**
 * Whether `excerpt` appears verbatim inside `pageText` under the canonical form.
 * `minimumLength` guards against a candidate that canonicalizes to a string too
 * short to be evidence of anything; an empty candidate is never a match.
 */
export function evidenceAnchorContains(
  pageText: string,
  excerpt: string,
  minimumLength = 1,
): boolean {
  const candidate = canonicalEvidenceAnchorText(excerpt);
  if (candidate.length < Math.max(1, minimumLength)) return false;
  return canonicalEvidenceAnchorText(pageText).includes(candidate);
}
