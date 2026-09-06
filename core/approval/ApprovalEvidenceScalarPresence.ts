import type { ContentDocument } from "../content/ContentDocument";

/**
 * 원고의 수치가 우리가 가져와 저장한 출처 발췌 안에 있는지 본다.
 *
 * D-045 는 페이지 내용과 원고 Claim 의 일치를 판정에 쓰지 않기로 했고 그건 그대로다.
 * 여기서 하는 일은 판정이 아니라 경고를 줄이는 것이고, 비교 대상도 남의 페이지가
 * 아니라 서버가 이미 가져와 문서에 저장해 둔 발췌다. 발행은 막지 않는다.
 *
 * 왜 필요한가: 미연결 수치 경고의 허용 목록은 verified Claim 에서만 만들어진다.
 * 내용 대조를 걷어낸 뒤로 어떤 Claim 도 verified 가 되지 않으므로 허용 목록은 항상
 * 비어 있고, 본문의 모든 수치가 예외 없이 경고가 된다. 2026-08-28 실측: 근로장려금
 * 원고의 경고 19개가 전부 국세청 발췌에 실재하는 값이었고, 전체 원고 112개 작업 중
 * 23개가 이 오탐이었다. 숫자가 많은 좋은 원고일수록 경고가 늘어난다.
 */
export function approvalEvidenceScalarHaystack(document: ContentDocument): string {
  const excerpts = (document.metadata?.approvalEvidence?.sources ?? [])
    .flatMap((source) => {
      const excerpt = typeof source.citationExcerpt === "string" ? source.citationExcerpt : "";
      const facts = (source.facts ?? []).map((fact) => fact.value);
      return [excerpt, ...facts];
    })
    .filter(Boolean)
    .join(" ");
  if (!excerpts.trim()) return "";
  return normalizeScalarText([excerpts, ...expandedDateForms(excerpts)].join(" "));
}

export function approvalEvidenceContainsScalar(haystack: string, value: string): boolean {
  if (!haystack) return false;
  const needle = normalizeScalarText(value);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  return expandedDateForms(value).some((form) => haystack.includes(normalizeScalarText(form)));
}

function normalizeScalarText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s,]+/gu, "");
}

/**
 * 정부 문서는 날짜를 축약해 쓴다 — 국세청 신청기간이 `’26.5.1.~6.1.` 이고 원고는
 * 이것을 `2026년 5월 1일` 로 풀어 쓴다. 같은 날짜인데 글자가 겹치지 않는다.
 * 그래서 찾은 날짜를 한국어 전개형으로도 만들어 함께 담는다. 이렇게 하면
 * `15일` 처럼 날짜에서 잘려 나온 조각도 전개형의 부분 문자열로 걸린다.
 */
function expandedDateForms(value: string): readonly string[] {
  const forms: string[] = [];
  const push = (year: number, month: number, day?: number) => {
    if (!Number.isInteger(year) || month < 1 || month > 12) return;
    if (day !== undefined && (day < 1 || day > 31)) return;
    forms.push(day === undefined ? `${year}년 ${month}월` : `${year}년 ${month}월 ${day}일`);
  };
  const fullYear = (raw: string): number => {
    const digits = Number(raw);
    if (!Number.isInteger(digits)) return Number.NaN;
    return raw.length === 4 ? digits : 2000 + digits;
  };

  // ’26.5.1. / 26.5.1 / 2026.5.1 / 2026-05-01
  for (const match of value.matchAll(/[’'‘]?(\d{2}|20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/gu)) {
    push(fullYear(match[1] ?? ""), Number(match[2]), Number(match[3]));
  }
  // ’26.5. / 2026-05  (일 없이 월까지)
  for (const match of value.matchAll(/[’'‘]?(\d{2}|20\d{2})\s*[.\-/]\s*(\d{1,2})(?!\s*[.\-/]\s*\d)/gu)) {
    push(fullYear(match[1] ?? ""), Number(match[2]));
  }
  // 2026년 5월 1일
  for (const match of value.matchAll(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu)) {
    push(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  /**
   * `’26.9.1~9.15.` 처럼 뒤쪽이 연도와 월을 생략한 범위. 앞에서 읽은 연도를
   * 이어 붙여야 `9월 15일` 이 나온다.
   */
  for (const match of value.matchAll(/[’'‘]?(\d{2}|20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]?\s*(\d{1,2})?\s*[.]?\s*~\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/gu)) {
    push(fullYear(match[1] ?? ""), Number(match[4]), Number(match[5]));
  }
  for (const match of value.matchAll(/[’'‘]?(\d{2}|20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.]?\s*~\s*(\d{1,2})(?!\s*[.\-/])/gu)) {
    push(fullYear(match[1] ?? ""), Number(match[2]), Number(match[4]));
  }
  return Object.freeze([...new Set(forms)]);
}
