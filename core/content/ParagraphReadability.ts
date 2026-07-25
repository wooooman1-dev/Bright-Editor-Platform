import { normalizeStructuredText, structuredListItems, structuredTableCount } from "./StructuredText";

const sentenceBoundaryPattern = /(?:[.!?。！？]+|(?:습니다|합니다|됩니다|있습니다|없습니다|입니다|세요|해요|돼요|나요|죠)(?:[.!?。！？]+)?)(?:\s+|$)/gu;

export function readableSentenceSegments(value: string): readonly string[] {
  const text = normalizeStructuredText(value);
  if (!text) return Object.freeze([]);

  const segments: string[] = [];
  let start = 0;
  for (const match of text.matchAll(sentenceBoundaryPattern)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const segment = text.slice(start, end).trim();
    if (segment) segments.push(segment);
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) segments.push(tail);
  return Object.freeze(segments.length ? segments : [text]);
}

export function readableSentenceCount(value: string): number {
  return readableSentenceSegments(value).length;
}

export function isStructuredParagraphText(value: string): boolean {
  return structuredListItems(value).length > 0 || structuredTableCount(value) > 0;
}

export function splitReadableParagraphText(
  value: string,
  options: Readonly<{ maximumSentences?: number; preferredSentences?: number }> = {},
): readonly string[] {
  const text = normalizeStructuredText(value);
  if (!text) return Object.freeze([]);
  if (isStructuredParagraphText(text)) return Object.freeze([text]);

  const maximum = Math.max(2, options.maximumSentences ?? 6);
  const preferred = Math.max(2, Math.min(maximum, options.preferredSentences ?? 4));
  const sentences = readableSentenceSegments(text);
  if (sentences.length <= maximum) return Object.freeze([text]);

  const paragraphs: string[] = [];
  let index = 0;
  while (index < sentences.length) {
    const remaining = sentences.length - index;
    let size = Math.min(preferred, remaining);
    if (remaining - size === 1) size -= 1;
    paragraphs.push(sentences.slice(index, index + size).join(" ").trim());
    index += size;
  }
  return Object.freeze(paragraphs.filter(Boolean));
}
