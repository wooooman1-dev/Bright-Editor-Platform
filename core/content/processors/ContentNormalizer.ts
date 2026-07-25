import type { ContentBlock } from "../ContentBlock";
import type { ContentBlockType } from "../ContentBlockType";
import type { ContentDocument } from "../ContentDocument";
import type { HeadingLevel } from "../blocks/HeadingBlock";
import { splitReadableParagraphText } from "../ParagraphReadability";
import { normalizeStructuredText } from "../StructuredText";

export class ContentNormalizer {
  normalize(document: ContentDocument): ContentDocument {
    try {
      const usedIds = new Set(
        document.blocks.map((block) => block.id).filter(Boolean),
      );
      const paragraphIds = new Map<string, readonly string[]>();
      let previousHeadingLevel: HeadingLevel | undefined;

      const blocks = document.blocks.flatMap((block, index) => {
        const id = block.id || createBlockId(block.type, index, usedIds);
        if (block.type === "paragraph") {
          const text = normalizeStructuredText(block.text);
          if (!text) return [];
          const paragraphs = splitReadableParagraphText(text);
          const ids = paragraphs.map((_, paragraphIndex) => paragraphIndex === 0
            ? id
            : createSplitBlockId(id, paragraphIndex + 1, usedIds));
          paragraphIds.set(id, Object.freeze(ids));
          return paragraphs.map((paragraph, paragraphIndex) => {
            const paragraphId = ids[paragraphIndex];
            return paragraphId === block.id && paragraph === block.text
              ? block
              : Object.freeze({ ...block, id: paragraphId, text: paragraph });
          });
        }

        const normalizedBlock = normalizeHeading(block, previousHeadingLevel, id);
        if (normalizedBlock.type === "heading") previousHeadingLevel = normalizedBlock.level;
        return [normalizedBlock];
      });

      const structure = document.metadata?.longFormStructure;
      const metadata = structure
        ? Object.freeze({
          ...document.metadata,
          longFormStructure: Object.freeze({
            introductionBlockIds: expandParagraphIds(structure.introductionBlockIds, paragraphIds),
            sections: Object.freeze(structure.sections.map((section) => Object.freeze({
              ...section,
              paragraphBlockIds: expandParagraphIds(section.paragraphBlockIds, paragraphIds),
            }))),
            conclusionBlockIds: expandParagraphIds(structure.conclusionBlockIds, paragraphIds),
          }),
        })
        : document.metadata;

      return Object.freeze({ ...document, ...(metadata ? { metadata } : {}), blocks: Object.freeze(blocks) });
    } catch {
      return document;
    }
  }
}

function normalizeHeading(
  block: ContentBlock,
  previousLevel: HeadingLevel | undefined,
  id: string,
): ContentBlock {
  if (block.type !== "heading") {
    return id === block.id ? block : Object.freeze({ ...block, id });
  }

  const boundedLevel = Math.min(6, Math.max(1, block.level)) as HeadingLevel;
  const level = previousLevel !== undefined && boundedLevel > previousLevel + 1
    ? ((previousLevel + 1) as HeadingLevel)
    : boundedLevel;
  const text = normalizeStructuredText(block.text);
  return id === block.id && level === block.level && text === block.text
    ? block
    : Object.freeze({ ...block, id, level, text });
}

function createBlockId(
  type: ContentBlockType,
  index: number,
  usedIds: Set<string>,
): string {
  let sequence = index + 1;
  let candidate = `${type}-${sequence}`;

  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${type}-${sequence}`;
  }

  usedIds.add(candidate);
  return candidate;
}

function createSplitBlockId(baseId: string, part: number, usedIds: Set<string>): string {
  let sequence = part;
  let candidate = `${baseId}-part-${sequence}`;
  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${baseId}-part-${sequence}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function expandParagraphIds(ids: readonly string[], mapping: ReadonlyMap<string, readonly string[]>): readonly string[] {
  return Object.freeze(ids.flatMap((id) => mapping.get(id) ?? [id]));
}
