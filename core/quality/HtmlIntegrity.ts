import type { ContentDocument } from "../content";

export const htmlIntegrityIssueCodes = [
  "raw_source_placeholder",
  "source_section_without_links",
  "paragraph_break_list",
  "image_comment_placeholder",
  "system_card_body_duplicate",
  "duplicate_source_section",
  "empty_href",
  "non_https_external_link",
  "table_semantics_missing",
  "mobile_table_wrapper_missing",
  "unsupported_raw_html",
  "internal_system_placeholder",
] as const;

export type HtmlIntegrityIssueCode = (typeof htmlIntegrityIssueCodes)[number];
export type HtmlIntegrityIssue = Readonly<{ code: HtmlIntegrityIssueCode; message: string }>;
export type HtmlIntegrityReport = Readonly<{ passed: boolean; issues: readonly HtmlIntegrityIssue[] }>;

/** Platform-neutral deterministic checks over the canonical document and its final HTML. */
export function evaluateHtmlIntegrity(document: ContentDocument, html: string): HtmlIntegrityReport {
  const issues: HtmlIntegrityIssue[] = [];
  const add = (code: HtmlIntegrityIssueCode, message: string) => {
    if (!issues.some((item) => item.code === code)) issues.push(Object.freeze({ code, message }));
  };

  if (/\((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\)/iu.test(html)) add("raw_source_placeholder", "실제 URL이 아닌 괄호형 출처 도메인 자리표시자가 공개 HTML에 남아 있습니다.");
  if (sourceSectionWithoutLink(html)) add("source_section_without_links", "출처 섹션에 클릭 가능한 HTTPS 원문 링크가 없습니다.");
  if (/<p\b[^>]*>[\s\S]*?(?:^|<br\s*\/?\s*>)\s*(?:[-*•]|\d+[.)])\s+[\s\S]*?<br\s*\/?\s*>\s*(?:[-*•]|\d+[.)])\s+/iu.test(html)) add("paragraph_break_list", "목록이 semantic list가 아니라 문단과 br로 렌더링되었습니다.");
  if (/<!--\s*image\s*:/iu.test(html)) add("image_comment_placeholder", "실제 이미지가 아닌 내부 이미지 주석이 공개 HTML에 남아 있습니다.");
  if (obviousSystemCardDuplicate(html)) add("system_card_body_duplicate", "시스템 시각 카드가 앞선 본문 문장을 그대로 반복합니다.");
  if (sourceSectionCount(html) > 1) add("duplicate_source_section", "공개 HTML에 출처 섹션이 둘 이상 있습니다.");
  if (/href\s*=\s*["']\s*["']/iu.test(html)) add("empty_href", "빈 링크 목적지가 공개 HTML에 있습니다.");
  if (/<a\b[^>]*href\s*=\s*["'](?:http:\/\/|javascript:|data:)/iu.test(html)) add("non_https_external_link", "HTTPS가 아닌 외부 링크가 공개 HTML에 있습니다.");

  const tableBlocks = document.blocks.filter((block) => block.type === "table").length;
  const renderedTables = matches(html, /<table\b/giu);
  const semanticTables = matches(html, /<table\b[\s\S]*?<thead\b[\s\S]*?<th\b[\s\S]*?<tbody\b[\s\S]*?<td\b[\s\S]*?<\/table>/giu);
  if (tableBlocks > 0 && (renderedTables < tableBlocks || semanticTables < tableBlocks)) add("table_semantics_missing", "canonical table이 thead, tbody, th, td 구조로 렌더링되지 않았습니다.");
  const mobileTableWrappers = matches(html, /<(?:figure|div)\b[^>]*(?:overflow-x\s*:\s*auto|bright-table-scroll)[^>]*>[\s\S]*?<table\b/giu);
  if (renderedTables > mobileTableWrappers) add("mobile_table_wrapper_missing", "모바일 가로 스크롤을 제공하는 table wrapper가 없습니다.");
  if (/<(?:script|iframe|object|embed|form)\b/iu.test(html)) add("unsupported_raw_html", "공개 원고 계약에서 지원하지 않는 raw HTML 요소가 있습니다.");
  if (/data-image-required|bright-link-required|URL\s*입력\s*필요|data-free-visual/iu.test(html)) add("internal_system_placeholder", "편집기 전용 placeholder 또는 내부 속성이 공개 HTML에 남아 있습니다.");

  return Object.freeze({ passed: issues.length === 0, issues: Object.freeze(issues) });
}

function sourceSectionWithoutLink(html: string): boolean {
  /**
   * "출처 확인일: 2026-08-19"는 섹션 제목이 아니라 날짜 한 줄이다.
   *
   * 시스템이 출처 섹션 안에 넣는 이 문단을 검사기가 새 출처 섹션의 시작으로
   * 읽으면, 그 뒤에 링크가 없어 `source_section_without_links` 가 뜨고 앞의
   * 진짜 섹션과 합쳐 `duplicate_source_section` 까지 뜬다. 날짜 역할 이름은
   * 승인 계약이 여러 곳에서 쓰므로 검사기 쪽에서 구분한다.
   */
  const section = /<(?:h[2-6]|p)\b[^>]*>\s*(?:공식\s*(?:확인\s*자료|출처)|출처|참고\s*자료)(?!\s*확인일)[\s\S]*?(?=<h[2-6]\b|$)/giu;
  return [...html.matchAll(section)].some((match) => !/<a\b[^>]*href\s*=\s*["']https:\/\//iu.test(match[0]));
}

function sourceSectionCount(html: string): number {
  return matches(html, /<(?:h[2-6]|p)\b[^>]*>\s*(?:공식\s*(?:확인\s*자료|출처)|출처|참고\s*자료)(?!\s*확인일)(?:\s|<|&)/giu);
}

function obviousSystemCardDuplicate(html: string): boolean {
  for (const card of html.matchAll(/<aside\b[^>]*bright-body-visual[^>]*>[\s\S]*?<\/aside>/giu)) {
    const before = plainText(html.slice(Math.max(0, (card.index ?? 0) - 4_000), card.index ?? 0));
    const items = [...card[0].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu)].map((match) => plainText(match[1])).filter((item) => item.length >= 20);
    if (items.length >= 2 && items.filter((item) => before.includes(item)).length >= 2) return true;
  }
  return false;
}

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/\s+/gu, " ").trim();
}

function matches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}
