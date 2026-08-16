import type { VerificationClaimSpec } from "./VerificationClaim";

export type VerificationClaimEvidenceMatch = Readonly<{
  matched: boolean;
  diagnostics: readonly string[];
}>;

/**
 * Binds an untrusted discovered Claim to the server-owned Planning Claim.
 * Numeric/date/duration literals are not independently compared with the
 * planning value. Evidence must still be anchored to the source and contain
 * enough subject/proposition concepts to bind the discovered Claim.
 */
export function evaluateVerificationClaimEvidenceMatch(input: Readonly<{
  spec: VerificationClaimSpec;
  submittedValue: string;
  evidenceExcerpt: string;
  pageText: string;
  normalizedValuePresent: boolean;
  normalizedValueMatchesPlanned: boolean;
}>): VerificationClaimEvidenceMatch {
  const excerpt = normalizeWhitespace(input.evidenceExcerpt);
  const page = normalizeWhitespace(input.pageText);
  const excerptFound = Boolean(excerpt) && compact(page).includes(compact(excerpt));
  const semanticMatch = propositionConceptMatch(input.spec, excerpt);
  const valueSupported = semanticMatch;
  const matched = Boolean(
    excerptFound
    && input.normalizedValuePresent
    && valueSupported,
  );

  return Object.freeze({
    matched,
    diagnostics: Object.freeze([
      ...(excerptFound ? [] : ["claim_evidence_excerpt_not_found"]),
      ...(valueSupported ? [] : ["claim_value_not_found"]),
      ...(input.normalizedValueMatchesPlanned ? [] : ["claim_raw_value_mismatch_ignored"]),
      ...(input.normalizedValuePresent ? [] : ["claim_normalization_failed"]),
    ]),
  });
}

function propositionConceptMatch(
  spec: VerificationClaimSpec,
  evidenceExcerpt: string,
): boolean {
  const evidence = compact(evidenceExcerpt);
  const identityConcepts = concepts([
    spec.field,
    spec.qualifiers.subject ?? "",
    spec.qualifiers.scope ?? "",
  ].join(" "));
  const propositionConcepts = concepts([
    spec.statement,
    spec.qualifiers.basis ?? "",
  ].join(" "));
  const identityMatches = identityConcepts.filter((token) => conceptPresent(evidence, token));
  const distinctiveIdentityConcepts = identityConcepts.filter((token) => !genericIdentityConcepts.has(token));
  const distinctiveIdentityMatches = distinctiveIdentityConcepts.filter((token) => conceptPresent(evidence, token));
  const propositionMatches = propositionConcepts.filter((token) => conceptPresent(evidence, token));
  const identityMatched = distinctiveIdentityConcepts.length > 0
    ? distinctiveIdentityMatches.length >= 1
    : identityMatches.length >= 1;
  return identityMatched
    && new Set(propositionMatches).size >= (distinctiveIdentityMatches.length > 0 ? 1 : 2);
}

function concepts(value: string): readonly string[] {
  const tokens = value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .match(/[0-9a-z\p{Script=Hangul}]{2,}/gu) ?? [];
  return Object.freeze([...new Set(tokens
    .map(stripKoreanSuffix)
    .filter((token) => token.length >= 2 && !conceptStopWords.has(token)))]
    .slice(0, 40));
}

function conceptPresent(compactEvidence: string, token: string): boolean {
  if (compactEvidence.includes(token)) return true;
  if (token.length < 4) return false;
  const stem = token.slice(0, Math.max(3, token.length - 1));
  return compactEvidence.includes(stem);
}

function stripKoreanSuffix(value: string): string {
  return value.replace(/(?:으로|에서|에게|까지|부터|마다|처럼|보다|이라면|이면|이며|이고|한다|된다|있는|없는|따라|대한|관한|관련|여부|경우|기준|방법|확인|적용|법적|현행|요건|사실관계|법령|그리고|또는|및|의|은|는|이|가|을|를|에|로|와|과)$/u, "");
}

function normalizeWhitespace(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function compact(value: string): string {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

const conceptStopWords = new Set([
  "공식", "자료", "안내", "페이지", "정보", "내용", "관련", "기준", "방법",
  "확인", "적용", "법적", "현행", "요건", "사실관계", "법령", "경우", "따라",
  "the", "and", "official", "information", "guide", "page",
]);

const genericIdentityConcepts = new Set([
  "대한민국", "법령", "범위", "주택", "임대차계약", "계약", "조건", "대상", "절차",
]);
