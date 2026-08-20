import { calculateContentMetrics } from "./ContentMetrics";
import type { ContentDocument } from "./ContentDocument";
import type { ContentMetadata } from "./ContentMetadata";

const MAX_TITLE_LENGTH = 68;
const placeholderKeywords = new Set(["article", "content", "guide", "본문"]);
const titleIntentPattern = /(?:가이드|방법|식단|효과|원인|증상|관리|추천|주의|완화|예방|비교|정리|이해)/u;

export function ensureSeoKeywordPlacement(
  document: ContentDocument,
  primaryKeyword: string | undefined,
): ContentDocument {
  const keyword = normalizeSeoKeyword(primaryKeyword ?? "");
  if (!keyword || placeholderKeywords.has(keyword.toLocaleLowerCase("ko-KR"))) {
    return document;
  }

  const title = buildReadableSeoTitle(document.title, keyword);
  const bodyText = document.blocks
    .filter((block) => block.type === "heading" || block.type === "paragraph")
    .map((block) => block.text)
    .join("\n");

  let bodyChanged = false;
  const blocks = containsExactKeyword(bodyText, keyword)
    ? document.blocks
    : document.blocks.map((block) => {
      if (!bodyChanged && block.type === "paragraph" && block.text.trim()) {
        bodyChanged = true;
        return Object.freeze({
          ...block,
          text: `${keyword} 관련 핵심 내용을 먼저 정리하면, ${block.text.trim()}`,
        });
      }
      return block;
    });

  const currentDescription = document.metadata?.metaDescription?.trim() ?? "";
  const firstParagraph = blocks.find((block) => block.type === "paragraph")?.text ?? "";
  const metaDescription = buildMetaDescription(
    currentDescription,
    firstParagraph,
    keyword,
  );

  const metadataChanged = !document.metadata
    || metaDescription !== currentDescription;
  const titleChanged = title !== document.title;

  if (!titleChanged && !bodyChanged && !metadataChanged) return document;

  return Object.freeze({
    ...document,
    blocks: bodyChanged ? Object.freeze(blocks) : document.blocks,
    metadata: metadataChanged
      ? createMetadata(document, blocks, metaDescription)
      : document.metadata,
    title,
  });
}

export function buildReadableSeoTitle(originalTitle: string, keyword: string): string {
  keyword = normalizeSeoKeyword(keyword);
  const normalizedTitle = normalizeTitle(originalTitle);
  const colonCount = (normalizedTitle.match(/:/gu) ?? []).length;
  const listSeparatorCount = (normalizedTitle.match(/[·,/]/gu) ?? []).length;

  if (
    containsExactKeyword(normalizedTitle, keyword)
    && countExactKeyword(normalizedTitle, keyword) === 1
    && normalizedTitle.length <= MAX_TITLE_LENGTH
    && colonCount <= 1
    && listSeparatorCount <= 2
  ) {
    return normalizedTitle;
  }

  const segments = normalizedTitle
    .split(/\s*:\s*/u)
    .map((segment) => compactTitleSegment(segment, keyword))
    .filter(Boolean);
  const supportCandidates = segments.filter((segment) => !containsExactKeyword(segment, keyword));
  let support = supportCandidates.sort((left, right) => titleSupportScore(right) - titleSupportScore(left))[0] ?? "";

  if (!support && !containsExactKeyword(normalizedTitle, keyword)) {
    support = compactTitleSegment(normalizedTitle, keyword);
  }
  if (support && /가이드/u.test(normalizedTitle) && !/(?:가이드|방법|정리)$/u.test(support)) {
    support = `${support} 가이드`;
  }

  const available = Math.max(0, MAX_TITLE_LENGTH - keyword.length - 2);
  support = shortenAtWordBoundary(support, available);
  return normalizeTitle(support ? `${keyword}: ${support}` : keyword);
}

/** 공백으로 갈리는 어절 수. 한 어절이면 나열 항목, 여러 어절이면 문장의 뒷도막이다. */
function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function compactTitleSegment(value: string, keyword: string): string {
  let segment = normalizeWhitespace(removeExactKeyword(value, keyword))
    .replace(/^[\-–—:·,\s]+|[\-–—:·,\s]+$/gu, "")
    .replace(/\([^)]{18,}\)/gu, "")
    .trim();

  /**
   * 나열을 접는 것은 제목이 정말 나열일 때만이다.
   *
   * 이 규칙은 "식이섬유·프로바이오틱스·프리바이오틱스" 같은 키워드 나열 제목을
   * 줄이려고 들어왔는데, 조각이 셋만 넘으면 무조건 첫 조각만 남겼다. 그래서
   * 서술어가 마지막 조각에 들어 있으면 문장이 통째로 잘렸다. 2026-08-19
   * 밝은재테크 실측: 원고 49편 중 3편의 제목이 이렇게 끊겼다.
   *
   *   가족관계·소득·재산·변동 사건을 나눠 확인하는 법 → 가족관계
   *   이번 달 원금·이자·잔액·상환일을 읽는 순서       → 이번 달 원금
   *
   * 가이드·방법·정리만 구제하던 예외가 이미 같은 문제를 절반쯤 알고 있었다.
   * 마지막 조각이 한 어절이면 나열 항목이고, 여러 어절이면 문장의 뒷도막이다.
   * 뒷도막이 있으면 접지 않는다 — 길이는 shortenAtWordBoundary 가 어절 경계에서
   * 처리하므로 제목이 문장 중간에서 끊길 일은 없다.
   */
  const listParts = segment.split(/\s*[·,/]\s*/u).filter(Boolean);
  if (listParts.length >= 3 && wordCount(listParts.at(-1) ?? "") <= 1) {
    segment = listParts[0] ?? segment;
  }

  return normalizeWhitespace(segment);
}

function titleSupportScore(value: string): number {
  const intentBonus = titleIntentPattern.test(value) ? 24 : 0;
  const listPenalty = (value.match(/[·,/]/gu) ?? []).length * 10;
  const lengthPenalty = Math.max(0, value.length - 28) * 1.5;
  return intentBonus - listPenalty - lengthPenalty;
}

function shortenAtWordBoundary(value: string, maxLength: number): string {
  if (!value || maxLength <= 0) return "";
  if (value.length <= maxLength) return value;

  const words = value.split(/\s+/u);
  let result = "";
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > maxLength) break;
    result = candidate;
  }
  return result || value.slice(0, maxLength).replace(/[\s:·,/-]+$/gu, "");
}

function normalizeTitle(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\s*:\s*/gu, ": ")
    .replace(/(?::\s*){2,}/gu, ": ")
    .replace(/\s+([?!])/gu, "$1")
    .replace(/[:\s]+$/gu, "")
    .trim();
}

function createMetadata(
  document: ContentDocument,
  blocks: ContentDocument["blocks"],
  metaDescription: string,
): ContentMetadata {
  const current = document.metadata;
  const timestamp = current?.updatedAt ?? new Date().toISOString();
  const metrics = calculateContentMetrics({ ...document, blocks });

  return Object.freeze({
    ...(current ?? {}),
    buttonCount: blocks.filter((block) => block.type === "button").length,
    createdAt: current?.createdAt ?? timestamp,
    generator: current?.generator ?? "seo-keyword-placement",
    imageCount: blocks.filter((block) => block.type === "image").length,
    language: current?.language ?? "ko",
    readingTime: metrics.estimatedReadingMinutes,
    source: current?.source ?? "ai",
    updatedAt: timestamp,
    version: current?.version ?? 1,
    videoCount: blocks.filter((block) => block.type === "video").length,
    wordCount: metrics.wordUnits,
    ...(current?.primarySearchIntent
      ? { primarySearchIntent: current.primarySearchIntent }
      : {}),
    ...(current?.secondaryIntent
      ? { secondaryIntent: current.secondaryIntent }
      : {}),
    ...(current?.secondaryKeywords
      ? { secondaryKeywords: current.secondaryKeywords }
      : {}),
    ...(current?.relatedTerms ? { relatedTerms: current.relatedTerms } : {}),
    metaDescription,
  });
}

function buildMetaDescription(
  currentDescription: string,
  firstParagraph: string,
  keyword: string,
): string {
  if (
    containsExactKeyword(currentDescription, keyword)
    && currentDescription.length >= 60
    && currentDescription.length <= 180
  ) {
    return currentDescription;
  }

  const source = normalizeWhitespace(currentDescription || firstParagraph);
  let candidate = normalizeWhitespace(
    `${keyword} 관련 핵심 내용과 판단 기준을 정리합니다. ${source}`,
  );

  if (candidate.length < 60) {
    candidate = normalizeWhitespace(
      `${candidate} 독자가 확인해야 할 실천 기준과 주의사항을 함께 안내합니다.`,
    );
  }

  if (candidate.length > 180) {
    candidate = `${candidate.slice(0, 179).trimEnd()}…`;
  }

  return candidate;
}

function containsExactKeyword(value: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSeoKeyword(keyword).toLocaleLowerCase("ko-KR");
  return Boolean(normalizedKeyword)
    && normalizeSeoKeyword(value).toLocaleLowerCase("ko-KR").includes(normalizedKeyword);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

/** Canonical comparison form for a confirmed SEO keyword. */
export function normalizeSeoKeyword(value: string): string {
  return normalizeWhitespace(value.normalize("NFKC"));
}

/** True only when the confirmed keyword remains one continuous normalized phrase. */
export function titleContainsPrimaryKeyword(title: string, primaryKeyword: string): boolean {
  return containsExactKeyword(title, primaryKeyword);
}

function countExactKeyword(value: string, keyword: string): number {
  const normalizedKeyword = normalizeSeoKeyword(keyword);
  if (!normalizedKeyword) return 0;
  return normalizeSeoKeyword(value).match(new RegExp(escapeRegExp(normalizedKeyword), "giu"))?.length ?? 0;
}

function removeExactKeyword(value: string, keyword: string): string {
  const normalizedKeyword = normalizeSeoKeyword(keyword);
  if (!normalizedKeyword) return normalizeSeoKeyword(value);
  return normalizeSeoKeyword(value).replace(new RegExp(escapeRegExp(normalizedKeyword), "giu"), " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
