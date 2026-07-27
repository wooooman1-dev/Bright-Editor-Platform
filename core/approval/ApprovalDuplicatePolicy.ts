import type { ContentDocument } from "../content/ContentDocument";
import type { ApprovalDuplicateCheckSnapshot } from "./ApprovalReadiness";

export type ApprovalDuplicateCandidate = Readonly<{
  contentId: string;
  document: ContentDocument;
}>;

export type ApprovalDuplicateComparison = Readonly<{
  contentId: string;
  titleSimilarity: number;
  headingSimilarity: number;
  bodySimilarity: number;
  overallSimilarity: number;
}>;

export function evaluateApprovalDuplicateRisk(
  current: ContentDocument,
  candidates: readonly ApprovalDuplicateCandidate[],
  checkedAt: string,
): ApprovalDuplicateCheckSnapshot {
  const comparisons = candidates
    .filter((candidate) => candidate.contentId !== current.id)
    .map((candidate) => compareDocuments(current, candidate))
    .sort((left, right) => right.overallSimilarity - left.overallSimilarity);
  const highest = comparisons[0];
  const reasons: string[] = [];

  let status: ApprovalDuplicateCheckSnapshot["status"] = "passed";
  if (highest) {
    const exactTitle = normalizeText(current.title) === normalizeText(
      candidates.find((candidate) => candidate.contentId === highest.contentId)?.document.title ?? "",
    );
    const structurallyDuplicated = highest.headingSimilarity >= 0.9 && highest.bodySimilarity >= 0.7;
    if (exactTitle || highest.overallSimilarity >= 0.82 || structurallyDuplicated) {
      status = "blocked";
      if (exactTitle) reasons.push("기존 콘텐츠와 제목이 사실상 동일합니다.");
      if (highest.overallSimilarity >= 0.82) reasons.push("제목·소제목·본문의 전체 유사도가 차단 기준을 넘었습니다.");
      if (structurallyDuplicated) reasons.push("소제목 구조와 본문 정보 구성이 함께 반복됩니다.");
    } else if (highest.overallSimilarity >= 0.62 || highest.headingSimilarity >= 0.75) {
      status = "needs_review";
      if (highest.overallSimilarity >= 0.62) reasons.push("기존 콘텐츠와 제공 정보의 유사도가 높아 고유 가치를 확인해야 합니다.");
      if (highest.headingSimilarity >= 0.75) reasons.push("소제목 구성과 정보 전개 순서가 기존 콘텐츠와 유사합니다.");
    }
  }

  return Object.freeze({
    version: "1.0",
    status,
    checkedAt,
    comparedContentIds: Object.freeze(comparisons.map((comparison) => comparison.contentId)),
    ...(highest ? {
      highestSimilarity: round(highest.overallSimilarity),
      matchedContentId: highest.contentId,
    } : {}),
    reasons: Object.freeze(reasons),
  });
}

export function compareApprovalDocuments(
  current: ContentDocument,
  candidate: ApprovalDuplicateCandidate,
): ApprovalDuplicateComparison {
  return compareDocuments(current, candidate);
}

function compareDocuments(
  current: ContentDocument,
  candidate: ApprovalDuplicateCandidate,
): ApprovalDuplicateComparison {
  const titleSimilarity = tokenSimilarity(tokens(current.title), tokens(candidate.document.title));
  const headingSimilarity = tokenSimilarity(
    headingTokens(current),
    headingTokens(candidate.document),
  );
  const bodySimilarity = tokenSimilarity(
    bodyTokens(current),
    bodyTokens(candidate.document),
  );
  const overallSimilarity = titleSimilarity * 0.35
    + headingSimilarity * 0.35
    + bodySimilarity * 0.3;
  return Object.freeze({
    contentId: candidate.contentId,
    titleSimilarity: round(titleSimilarity),
    headingSimilarity: round(headingSimilarity),
    bodySimilarity: round(bodySimilarity),
    overallSimilarity: round(overallSimilarity),
  });
}

function headingTokens(document: ContentDocument): ReadonlySet<string> {
  return tokens(document.blocks
    .filter((block) => block.type === "heading")
    .map((block) => block.text)
    .join(" "));
}

function bodyTokens(document: ContentDocument): ReadonlySet<string> {
  const text = document.blocks.flatMap((block) => {
    if (block.type === "heading" || block.type === "paragraph") return [block.text];
    if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
    if (block.type === "image") return [block.alt, block.prompt ?? ""];
    if (block.type === "button") return [block.label];
    return [];
  }).join(" ");
  return tokens(text);
}

function tokens(value: string): ReadonlySet<string> {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();
  return new Set(normalized
    .split(" ")
    .filter((token) => token.length >= 2 && !stopWords.has(token)));
}

function tokenSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

const stopWords = new Set([
  "그리고", "그러나", "하지만", "위한", "통해", "대한", "에서", "으로", "부터", "까지",
  "하는", "있는", "없는", "하면", "이것", "저것", "무엇", "어떻게", "가이드", "정리",
  "알아보기", "설명", "방법", "기준", "the", "and", "for", "with", "from", "this", "that",
]);
