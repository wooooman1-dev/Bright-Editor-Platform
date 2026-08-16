import type { VerificationClaimKind, VerificationClaimSpec } from "./VerificationClaim";

export type VerificationClaimEvidenceMatch = Readonly<{
  matched: boolean;
  diagnostics: readonly string[];
}>;

/**
 * Binds an untrusted discovered Claim to the server-owned Planning Claim.
 * A source may disagree on the literal value, but it must still describe the
 * same semantic Claim shape. Numeric/date values are therefore resolved by
 * corroboration consensus instead of being rejected merely for differing.
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
  // Semantic identity must be established from the server-fetched page, not
  // from the untrusted excerpt supplied by discovery. Otherwise a fabricated
  // excerpt can make an unrelated page look like support for the Claim.
  const valueSupported = propositionConceptMatch(input.spec, page);
  const rawValueMatches = input.normalizedValueMatchesPlanned;
  const claimShapeCompatible = claimValueShapeCompatible(input.spec, input.submittedValue);
  const matched = Boolean(
    excerptFound
    && input.normalizedValuePresent
    && valueSupported
    && (rawValueMatches || claimShapeCompatible),
  );

  return Object.freeze({
    matched,
    diagnostics: Object.freeze([
      ...(excerptFound ? [] : ["claim_evidence_excerpt_not_found"]),
      ...(valueSupported ? [] : ["claim_value_not_found"]),
      ...(rawValueMatches ? [] : ["claim_raw_value_mismatch"]),
      ...(claimShapeCompatible ? [] : ["claim_value_shape_mismatch"]),
      ...(input.normalizedValuePresent ? [] : ["claim_normalization_failed"]),
    ]),
  });
}

function claimValueShapeCompatible(spec: VerificationClaimSpec, submittedValue: string): boolean {
  if (!spec.rawValue) return true;
  const planned = spec.rawValue.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const submitted = submittedValue.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!planned || !submitted) return false;

  if (spec.kind === "money") {
    const plannedBasis = moneyBasisToken(planned);
    const submittedBasis = moneyBasisToken(submitted);
    return !plannedBasis || !submittedBasis || plannedBasis === submittedBasis;
  }
  if (spec.kind === "ratio") return ratioShape(planned) === ratioShape(submitted);
  if (spec.kind === "duration") return durationShape(planned) === durationShape(submitted);
  return true;
}

function moneyBasisToken(value: string): string | undefined {
  const normalized = value.toLocaleLowerCase("ko-KR");
  if (/(?:월|매월|월간|월별)/u.test(normalized)) return "monthly";
  if (/(?:연|연간|연별|매년)/u.test(normalized)) return "annual";
  if (/(?:일|일일|매일|하루)/u.test(normalized)) return "daily";
  if (/(?:1인당|인당|개인당)/u.test(normalized)) return "perPerson";
  if (/(?:가구당|세대당)/u.test(normalized)) return "perHousehold";
  if (/(?:1회|일회|한\s*번)/u.test(normalized)) return "oneTime";
  return undefined;
}

function ratioShape(value: string): string {
  const normalized = value.toLocaleLowerCase("ko-KR");
  if (/%p|퍼센트포인트/u.test(normalized)) return "percentagePoint";
  return /%|퍼센트/u.test(normalized) ? "percent" : "unknown";
}

function durationShape(value: string): string {
  const normalized = value.toLocaleLowerCase("ko-KR");
  const unit = /(?:일간?|일)/u.test(normalized) ? "day"
    : /(?:주간?|주)/u.test(normalized) ? "week"
      : /(?:개월?|달)/u.test(normalized) ? "month"
        : /(?:년간?|년)/u.test(normalized) ? "year"
          : "unknown";
  const comparator = /(?:최대|이하|이내)/u.test(normalized) ? "upTo"
    : /(?:최소|이상)/u.test(normalized) ? "atLeast"
      : "none";
  return `${unit}:${comparator}`;
}

function propositionConceptMatch(
  spec: VerificationClaimSpec,
  pageText: string,
): boolean {
  const evidence = compact(pageText);
  const fieldConcepts = concepts(spec.field);
  const subjectConcepts = concepts([
    spec.qualifiers.subject ?? "",
    spec.qualifiers.scope ?? "",
  ].join(" "));
  const identityConcepts = concepts([
    spec.field,
    spec.statement,
    spec.qualifiers.subject ?? "",
    spec.qualifiers.scope ?? "",
  ].join(" "));
  const propositionConcepts = concepts([
    spec.statement,
    spec.qualifiers.basis ?? "",
  ].join(" "));
  const distinctiveIdentityConcepts = identityConcepts.filter((token) => !genericIdentityConcepts.has(token));

  // Prefer concepts shared by the server-owned field and subject. This gives
  // legal Claims a stable semantic anchor (for example, "확정일자") instead
  // of allowing a broad legal term such as "법적" to match an unrelated law.
  const fieldSubjectAnchors = [...new Set([
    ...fieldConcepts.filter((token) => subjectConcepts.includes(token)),
    ...fieldConcepts.filter((token) => !genericIdentityConcepts.has(token)),
  ])];
  const strictAnchors = spec.kind === "legal"
    ? fieldSubjectAnchors
    : fieldSubjectAnchors.slice(0, 2);
  const anchorMatches = strictAnchors.filter((token) => conceptPresent(evidence, token, spec.kind === "legal"));
  if (strictAnchors.length > 0 && anchorMatches.length === 0) return false;

  const distinctiveIdentityMatches = distinctiveIdentityConcepts.filter((token) =>
    conceptPresent(evidence, token, spec.kind === "legal"));
  const propositionMatches = propositionConcepts.filter((token) =>
    conceptPresent(evidence, token, spec.kind === "legal"));
  const identityMatched = strictAnchors.length > 0
    ? anchorMatches.length >= 1
    : distinctiveIdentityConcepts.length > 0
      ? distinctiveIdentityMatches.length >= 1
      : identityConcepts.some((token) => conceptPresent(evidence, token, spec.kind === "legal"));

  return identityMatched
    && propositionMatches.length >= (spec.kind === "legal" && strictAnchors.length > 0 ? 1 : 1);
}

function concepts(value: string): readonly string[] {
  const tokens = value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .match(/[0-9a-z\p{Script=Hangul}]{2,}/gu) ?? [];
  return Object.freeze([...new Set(tokens
    .map(stripKoreanSuffix)
    .filter((token) => token.length >= 2 && !conceptStopWords.has(token)))]
    .slice(0, 40));
}

function conceptPresent(compactEvidence: string, token: string, strict = false): boolean {
  if (compactEvidence.includes(token)) return true;
  if (strict || token.length < 4) return false;
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
