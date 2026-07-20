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
  const persisted = document.metadata?.tags?.filter((item) => typeof item === "string" && item.trim()) ?? [];
  const tags: string[] = [];
  const seen = new Set<string>();
  const maximum = Math.max(1, limit);

  const add = (candidates: readonly string[], perSource: number) => {
    let added = 0;
    for (const candidate of candidates) {
      const normalized = normalizeTag(candidate);
      const key = normalized.toLocaleLowerCase("ko-KR");
      if (!normalized || seen.has(key) || genericTerms.has(key)) continue;
      if (normalized.length < 2 || normalized.length > 24) continue;
      seen.add(key);
      tags.push(normalized);
      added += 1;
      if (tags.length >= maximum || added >= perSource) break;
    }
  };

  add(persisted, maximum);
  if (primaryKeyword?.trim()) add(tagCandidates(primaryKeyword), 3);
  for (const keyword of document.metadata?.secondaryKeywords ?? []) {
    if (tags.length >= maximum) break;
    add(tagCandidates(keyword), 1);
  }
  for (const term of document.metadata?.relatedTerms ?? []) {
    if (tags.length >= maximum) break;
    add(tagCandidates(term), 1);
  }

  const fallbackSources = [
    document.title,
    ...document.blocks
      .filter((block) => block.type === "heading")
      .slice(0, 6)
      .map((block) => block.text),
  ];
  for (const source of fallbackSources) {
    if (tags.length >= maximum) break;
    add(tagCandidates(source), 1);
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
      .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ""))
      .filter((word) => word.length > 0 && !genericTerms.has(word.toLocaleLowerCase("ko-KR")))
      .map(stripKoreanParticle)
      .filter((word) => word.length > 0 && !genericTerms.has(word.toLocaleLowerCase("ko-KR")));
    if (!words.length) continue;

    if (words.length === 1) {
      candidates.push(words[0]);
      continue;
    }
    if (words.length === 2) {
      candidates.push(words.join(""));
      continue;
    }

    const leadingPair = `${words[0]}${words[1]}`;
    if (leadingPair.length >= 3 && leadingPair.length <= 18) candidates.push(leadingPair);
    const last = words.at(-1) ?? "";
    if (last.length >= 2 && last.length <= 16) candidates.push(last);
    const compact = words.join("");
    if (compact.length <= 18) candidates.push(compact);
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
