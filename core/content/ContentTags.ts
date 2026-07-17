import type { ContentDocument } from "./ContentDocument";

const genericTerms = new Set([
  "가이드", "관련", "방법", "영향", "정보", "정리", "총정리", "핵심", "실천", "알아보기",
  "미치는", "위한", "통해", "대해", "대한", "입니다", "있습니다", "합니다", "하는", "되는",
]);

export function deriveContentTags(
  document: ContentDocument,
  primaryKeyword?: string,
  limit = 8,
): readonly string[] {
  const sources = [
    primaryKeyword,
    ...(document.metadata?.secondaryKeywords ?? []),
    ...(document.metadata?.relatedTerms ?? []),
    document.title,
    ...document.blocks
      .filter((block) => block.type === "heading")
      .slice(0, 6)
      .map((block) => block.text),
  ].filter((value): value is string => Boolean(value?.trim()));

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const candidate of tagCandidates(source)) {
      const normalized = normalizeTag(candidate);
      const key = normalized.toLocaleLowerCase("ko-KR");
      if (!normalized || seen.has(key) || genericTerms.has(key)) continue;
      if (normalized.length < 2 || normalized.length > 24) continue;
      seen.add(key);
      tags.push(normalized);
      if (tags.length >= Math.max(1, limit)) return Object.freeze(tags);
    }
  }

  return Object.freeze(tags);
}

function tagCandidates(source: string): string[] {
  const normalized = source
    .replace(/[#()[\]{}]/gu, " ")
    .replace(/[,:;|/]+/gu, " · ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return [];

  const candidates: string[] = [];
  const segments = normalized.split(/\s*[·]\s*/u).map((item) => item.trim()).filter(Boolean);

  for (const segment of segments) {
    const words = segment
      .split(/\s+/u)
      .map(stripKoreanParticle)
      .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ""))
      .filter((word) => word.length > 0 && !genericTerms.has(word.toLocaleLowerCase("ko-KR")));

    const compact = words.join("");
    if (words.length <= 3 && compact.length <= 20) candidates.push(compact);

    for (let index = 0; index < words.length - 1; index += 1) {
      const pair = `${words[index]}${words[index + 1]}`;
      if (pair.length >= 3 && pair.length <= 18) candidates.push(pair);
    }

    for (const word of words) {
      if (word.length >= 2 && word.length <= 16) candidates.push(word);
    }
  }

  return candidates;
}

function stripKoreanParticle(value: string): string {
  return value.replace(/(?:으로|에서|에게|까지|부터|보다|처럼|하고|이며|이고|은|는|이|가|을|를|에|의|과|와|로)$/u, "");
}

function normalizeTag(value: string): string {
  return value
    .replace(/^#+/u, "")
    .replace(/\s+/gu, "")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/^-+|-+$/gu, "")
    .trim();
}
