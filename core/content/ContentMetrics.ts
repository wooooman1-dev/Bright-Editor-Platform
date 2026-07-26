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
}>;

/** Reading time uses 500 Korean syllables/minute plus 200 Latin/number words/minute. */
export function calculateContentMetrics(document: ContentDocument): ContentMetrics {
  const text = document.blocks.map(blockText).filter(Boolean).join("\n\n").trim();
  const koreanCharacterCount = (text.match(/[\p{Script=Hangul}]/gu) ?? []).length;
  const latinWordCount = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
  const wordUnits = (text.match(/[\p{Script=Hangul}]+|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu) ?? []).length;
  const readingUnits = koreanCharacterCount / 500 + latinWordCount / 200;
  return Object.freeze({
    koreanCharacterCount,
    charactersWithSpaces: text.length,
    charactersWithoutSpaces: text.replace(/\s/gu, "").length,
    wordUnits,
    paragraphCount: document.blocks.filter((block) => block.type === "paragraph" && block.text.trim()).length,
    headingCount: document.blocks.filter((block) => block.type === "heading" && block.text.trim()).length,
    estimatedReadingMinutes: text ? Math.max(1, Math.ceil(readingUnits)) : 0,
  });
}

export function canonicalDocumentText(document: ContentDocument): string {
  return document.blocks.map(blockText).filter(Boolean).join("\n\n").trim();
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
