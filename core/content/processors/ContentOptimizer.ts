import type { ContentBlock } from "../ContentBlock";
import type { ContentDocument } from "../ContentDocument";
import type { ContentMetadata } from "../ContentMetadata";
import { normalizeStructuredTable, serializeStructuredTable } from "../StructuredText";

const WORDS_PER_MINUTE = 200;

export type ContentOptimizerOptions = Readonly<{
  generator?: string;
  language?: string;
  now?: () => Date;
  source?: string;
}>;

export class ContentOptimizer {
  private readonly now: () => Date;

  constructor(private readonly options: ContentOptimizerOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  optimize(document: ContentDocument): ContentDocument {
    const blocks = document.blocks.flatMap(trimBlock);
    const metadata = createMetadata(document, blocks, this.options, this.now());

    return Object.freeze({
      ...document,
      blocks: Object.freeze(blocks),
      metadata,
      title: document.title.trim(),
    });
  }
}

function trimBlock(block: ContentBlock): readonly ContentBlock[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [Object.freeze({ ...block, text: normalizeWhitespace(block.text) })];
    case "table": {
      const table = normalizeStructuredTable(block);
      return table ? [Object.freeze({ ...block, ...table })] : [];
    }
    case "image":
      return [Object.freeze({
        ...block,
        alt: block.alt.trim(),
        caption: block.caption?.trim(),
        source: block.source.trim(),
      })];
    case "video":
      return [Object.freeze({
        ...block,
        caption: block.caption?.trim(),
        source: block.source.trim(),
      })];
    case "button":
      return [Object.freeze({
        ...block,
        label: normalizeWhitespace(block.label),
        targetUrl: block.targetUrl.trim(),
      })];
  }
}

function createMetadata(
  document: ContentDocument,
  blocks: readonly ContentBlock[],
  options: ContentOptimizerOptions,
  now: Date,
): ContentMetadata {
  const timestamp = now.toISOString();
  const wordCount = countWords(document.title, blocks);

  return Object.freeze({
    buttonCount: blocks.filter((block) => block.type === "button").length,
    createdAt: document.metadata?.createdAt ?? timestamp,
    generator: document.metadata?.generator ?? options.generator ?? "bright-studio",
    imageCount: blocks.filter((block) => block.type === "image").length,
    language: document.metadata?.language ?? options.language ?? "und",
    readingTime: wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
    source: document.metadata?.source ?? options.source ?? "unknown",
    updatedAt: timestamp,
    version: document.metadata?.version ?? 1,
    videoCount: blocks.filter((block) => block.type === "video").length,
    wordCount,
  });
}

function countWords(title: string, blocks: readonly ContentBlock[]): number {
  // Word count includes visible text plus image alternative text and captions.
  const text = [
    title,
    ...blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") return [block.text];
      if (block.type === "table") return [serializeStructuredTable(block)];
      if (block.type === "button") return [block.label];
      if (block.type === "image") return [block.alt, block.caption ?? ""];
      return [block.caption ?? ""];
    }),
  ].join(" ");

  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
