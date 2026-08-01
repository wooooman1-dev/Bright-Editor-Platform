import type { ContentBlock } from "./ContentBlock";
import type { ContentDocument } from "./ContentDocument";
import { serializeStructuredTable } from "./StructuredText";

export type ContentMetrics = Readonly<{
  koreanCharacterCount: number;
  charactersWithSpaces: number;
  charactersWithoutSpaces: number;
  wordUnits: number;
  paragraphCount: number;
  headingCount: number;
  estimatedReadingMinutes: number;
  editorialCharactersWithoutSpaces: number;
  supplementCharactersWithoutSpaces: number;
}>;

/** Reading time uses 500 Korean syllables/minute plus 200 Latin/number words/minute. */
export function calculateContentMetrics(document: ContentDocument): ContentMetrics {
  const segments = metricSegments(document);
  const text = [...segments.editorial, ...segments.supplement].filter(Boolean).join("\n\n").trim();
  const editorialText = segments.editorial.filter(Boolean).join("\n\n").trim();
  const supplementText = segments.supplement.filter(Boolean).join("\n\n").trim();
  const koreanCharacterCount = (text.match(/[\p{Script=Hangul}]/gu) ?? []).length;
  const latinWordCount = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
  const wordUnits = (text.match(/[\p{Script=Hangul}]+|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu) ?? []).length;
  const readingUnits = ((editorialText.match(/[\p{Script=Hangul}]/gu) ?? []).length) / 500
    + ((editorialText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length) / 200;
  return Object.freeze({
    koreanCharacterCount,
    charactersWithSpaces: text.length,
    charactersWithoutSpaces: text.replace(/\s/gu, "").length,
    wordUnits,
    paragraphCount: document.blocks.filter((block) => block.type === "paragraph" && block.text.trim() && !isSourceBlock(block)).length,
    headingCount: document.blocks.filter((block) => block.type === "heading" && block.text.trim() && !isSourceBlock(block)).length,
    estimatedReadingMinutes: editorialText ? Math.max(1, Math.ceil(readingUnits)) : 0,
    editorialCharactersWithoutSpaces: editorialText.replace(/\s/gu, "").length,
    supplementCharactersWithoutSpaces: supplementText.replace(/\s/gu, "").length,
  });
}

export function canonicalDocumentText(document: ContentDocument): string {
  return document.blocks.map((block) =>
    block.type === "button"
      ? stripMarkup(`${block.label} ${block.targetUrl}`)
      : blockText(block)).filter(Boolean).join("\n\n").trim();
}

function metricSegments(document: ContentDocument): Readonly<{ editorial: string[]; supplement: string[] }> {
  const editorial: string[] = [];
  const supplement: string[] = [];
  let sourceSection = false;
  for (const block of document.blocks) {
    if (block.type === "heading") {
      sourceSection = isSourceHeading(block.text) || block.id === "approval-sources-heading";
      (sourceSection ? supplement : editorial).push(blockText(block));
      continue;
    }
    const target = sourceSection || isSourceBlock(block) || block.type === "button" || block.type === "image"
      ? supplement
      : editorial;
    target.push(blockText(block));
  }
  return { editorial, supplement };
}

function isSourceHeading(value: string): boolean {
  return /^(?:공식\s*(?:확인처|출처)|출처|참고\s*자료)/u.test(value.trim());
}

function isSourceBlock(block: ContentBlock): boolean {
  return block.id.startsWith("approval-source")
    || block.id === "approval-review-date"
    || (block.type === "button" && block.purpose === "source");
}

function blockText(block: ContentBlock): string {
  if (block.type === "heading" || block.type === "paragraph") return stripMarkup(block.text);
  if (block.type === "table") return stripMarkup(serializeStructuredTable(block));
  if (block.type === "button") return stripMarkup(block.label);
  if (block.type === "image") return stripMarkup(`${block.alt} ${block.caption ?? ""}`);
  return "";
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, " ").replace(/[ \t]+/g, " ").trim();
}
