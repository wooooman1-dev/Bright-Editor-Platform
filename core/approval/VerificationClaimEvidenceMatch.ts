import { evidenceExcerptAnchored } from "./ApprovalEvidenceAnchor";
import type { VerificationClaimSpec } from "./VerificationClaim";

export type VerificationClaimEvidenceMatch = Readonly<{
  matched: boolean;
  diagnostics: readonly string[];
}>;

/**
 * Binds an untrusted discovered Claim to the server-owned Planning Claim.
 * Scalar Claims remain exact-value contracts. Proposition Claims may use a
 * provider paraphrase, but only when the verbatim Claim excerpt contains the
 * Planning Claim's concrete subject concepts and every explicit literal.
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
  const submitted = normalizeWhitespace(input.submittedValue);
  /**
   * 발췌가 그 페이지에 실려 있는지 보는 규칙은 하나여야 한다.
   *
   * 이 검사는 정확한 부분문자열을 요구했다. 그런데 같은 질문을 Preflight 와
   * Coverage 는 `evidenceExcerptAnchored` 로 본다 — 모델의 인용과 서버의 추출이
   * 살아 있는 페이지를 각자 읽은 결과라 글자 하나까지 같기를 요구할 수 없기
   * 때문이다. ApprovalSourcePreflight 주석이 그 이력을 남겨 두었다: 두 곳이
   * 각자 정확 대조를 하다가 한쪽만 풀어서 다른 쪽이 거부했고, 그래서 규칙을
   * 하나로 모았다. 이 세 번째 자리가 그때 안 옮겨졌다.
   *
   * 2026-08-26 밝은재테크 실측: 선택약정 원고의 '선택약정 재가입 대상' Claim 이
   * claim_evidence_excerpt_not_found 로 값을 잃었다. 그런데 같은 출처의
   * citationExcerpt 에는 페이지 본문이 충분히 들어와 있었다 — 못 읽은 것도,
   * 지어낸 것도 아니고 두 추출이 줄바꿈과 목록 기호에서 갈린 것이다.
   *
   * 앵커 규칙도 발췌의 모든 글자가 페이지에 순서대로 있어야 하므로 지어낸
   * 인용은 그대로 걸러진다. 정규화는 이 파일의 `compact` 를 그대로 쓴다 —
   * 앵커 함수는 알고리즘만 공유하고 정규화는 호출부에 맡긴다.
   */
  const excerptFound = Boolean(excerpt) && evidenceExcerptAnchored(compact(page), compact(excerpt));
  const exactValueFound = Boolean(submitted) && compact(page).includes(compact(submitted));
  const scalar = scalarClaim(input.spec);
  const literalMatch = scalar || explicitLiterals(input.spec).every((literal) =>
    compact(excerpt).includes(compact(literal)));
  const semanticMatch = !scalar
    && propositionConceptMatch(input.spec, excerpt);
  const valueSupported = exactValueFound || semanticMatch;
  /**
   * 판정은 "지어냈는가" 하나만 본다 (D-045).
   *
   * 이 함수는 다섯 조건을 AND 로 묶었다 — 발췌가 페이지에 있는가, 값이 페이지에
   * 있는가, 발췌가 기획 Claim 의 개념을 담았는가, 기획이 적은 리터럴이 발췌에
   * 있는가, 기획 rawValue 와 정규화 값이 같은가. 앞의 하나를 뺀 넷은 전부
   * "출처 내용이 우리 기획과 맞나" 를 따지는 내용 대조다. D-045 는 그 대조를
   * 하지 않기로 정했다.
   *
   * 그런데 `matched` 가 false 면 호출부가 정규화된 값까지 버린다. 막지는 않지만
   * 쓸 값이 없어지므로 결과는 대조로 막는 것과 같다. 2026-08-26 밝은재테크
   * 실측: 선택약정 원고의 CRITICAL 4건 중 값이 살아남은 것은 1건이었고, 본문에
   * 숫자가 하나도 나가지 않았다.
   *
   * 다만 normalizedValuePresent 는 남긴다. 그것은 출처 내용과 기획을 견주는
   * 판단이 아니라 우리 파서가 값을 만들지 못했다는 사실이다. 단위 없는 500000
   * 을 값 없이 뒷받침됨으로 넘기면 생성이 단위 없는 숫자를 쓸 수 있다.
   *
   * 판정에서 빼는 하나는 `excerptFound` 다. 발췌가 그 페이지에 실제로 있는지 보는
   * 검사이고, 지어낸 인용을 거르는 유일한 관문이다. D-045 가 지어낸 주소를
   * 거르려고 페이지 존재 확인을 남긴 것과 같은 자리다. 나머지 넷은 진단으로만
   * 기록해 무엇이 어긋났는지는 계속 보이게 한다.
   */
  const matched = excerptFound && input.normalizedValuePresent;

  return Object.freeze({
    matched,
    diagnostics: Object.freeze([
      ...(excerptFound ? [] : ["claim_evidence_excerpt_not_found"]),
      ...(valueSupported ? [] : ["claim_value_not_found"]),
      ...(literalMatch ? [] : ["claim_explicit_literal_mismatch"]),
      ...(input.normalizedValueMatchesPlanned ? [] : ["claim_raw_value_mismatch"]),
      ...(input.normalizedValuePresent ? [] : ["claim_normalization_failed"]),
    ]),
  });
}

function scalarClaim(spec: VerificationClaimSpec): boolean {
  return Boolean(spec.rawValue?.trim())
    || ["money", "ratio", "date", "dateRange", "duration"].includes(spec.kind);
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

function explicitLiterals(spec: VerificationClaimSpec): readonly string[] {
  const value = [spec.rawValue ?? "", spec.statement].join(" ").normalize("NFKC");
  const found = new Set<string>();
  for (const match of value.matchAll(/20\d{2}(?:[-./년]\s*\d{1,2}(?:[-./월]\s*\d{1,2}일?)?)?/gu)) {
    if (match[0]) found.add(match[0]);
  }
  for (const match of value.matchAll(/\d+(?:[.,]\d+)?\s*(?:%|퍼센트|%p|원|만원|천원|억원|일|주|개월|년|시간|분)/giu)) {
    if (match[0]) found.add(match[0]);
  }
  for (const match of value.matchAll(/제\s*\d+\s*조(?:의\s*\d+)?(?:\s*제\s*\d+\s*항)?/gu)) {
    if (match[0]) found.add(match[0]);
  }
  return Object.freeze([...found]);
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
