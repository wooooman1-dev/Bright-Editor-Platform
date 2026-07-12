import type { ContentBlock } from "../ContentBlock";
import type { ContentBlockType } from "../ContentBlockType";
import type { ContentDocument } from "../ContentDocument";
import type { HeadingLevel } from "../blocks/HeadingBlock";

export class ContentNormalizer {
  normalize(document: ContentDocument): ContentDocument {
    try {
      const usedIds = new Set(
        document.blocks.map((block) => block.id).filter(Boolean),
      );
      let previousHeadingLevel: HeadingLevel | undefined;

      const blocks = document.blocks.flatMap((block, index) => {
        if (block.type === "paragraph" && block.text.trim().length === 0) {
          return [];
        }

        const id = block.id || createBlockId(block.type, index, usedIds);
        const normalizedBlock = normalizeHeading(block, previousHeadingLevel, id);

        if (normalizedBlock.type === "heading") {
          previousHeadingLevel = normalizedBlock.level;
        }

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
  previousLevel: HeadingLevel | undefined,
  id: string,
): ContentBlock {
  if (block.type !== "heading") {
    return id === block.id ? block : Object.freeze({ ...block, id });
  }

  const boundedLevel = Math.min(6, Math.max(1, block.level)) as HeadingLevel;
  const level =
    previousLevel !== undefined && boundedLevel > previousLevel + 1
      ? ((previousLevel + 1) as HeadingLevel)
      : boundedLevel;

  return Object.freeze({ ...block, id, level });
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
