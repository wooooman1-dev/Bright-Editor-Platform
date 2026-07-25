import type { ContentBlock } from "../ContentBlock";
import type { ContentBlockType } from "../ContentBlockType";
import type { ContentDocument } from "../ContentDocument";
import type { HeadingLevel } from "../blocks/HeadingBlock";
import { normalizeStructuredText } from "../StructuredText";

export class ContentNormalizer {
  normalize(document: ContentDocument): ContentDocument {
    try {
      const usedIds = new Set(
        document.blocks.map((block) => block.id).filter(Boolean),
      );
      let previousHeadingLevel: HeadingLevel | undefined;

      const blocks = document.blocks.flatMap((block, index) => {
        const id = block.id || createBlockId(block.type, index, usedIds);
        if (block.type === "paragraph") {
          const text = normalizeStructuredText(block.text);
          if (!text) return [];
          return [id === block.id && text === block.text
            ? block
            : Object.freeze({ ...block, id, text })];
        }

        const normalizedBlock = normalizeHeading(block, previousHeadingLevel, id);
        if (normalizedBlock.type === "heading") previousHeadingLevel = normalizedBlock.level;
        return [normalizedBlock];
      });

      return Object.freeze({ ...document, blocks: Object.freeze(blocks) });
    } catch {
      return document;
    }
  }
}

function normalizeHeading(
  block: ContentBlock,
  previousHeadingLevel: HeadingLevel | undefined,
  id: string,
): ContentBlock {
  if (block.type !== "heading") {
    return id === block.id ? block : Object.freeze({ ...block, id });
  }

  const boundedLevel = Math.min(6, Math.max(1, block.level)) as HeadingLevel;
  const level = previousHeadingLevel !== undefined && boundedLevel > previousHeadingLevel + 1
    ? ((previousHeadingLevel + 1) as HeadingLevel)
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
