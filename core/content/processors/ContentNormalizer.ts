import type { ContentBlock } from "../ContentBlock";
import { normalizeContentBlockOwnership } from "../ContentBlockOwnership";
import type { ContentBlockType } from "../ContentBlockType";
import type { ContentDocument } from "../ContentDocument";
import { normalizeEditorialMarkupDocument } from "../EditorialMarkupIntegrity";
import type { HeadingLevel } from "../blocks/HeadingBlock";
import {
  normalizeStructuredTable,
  normalizeStructuredText,
  parseStructuredList,
  parseStructuredText,
} from "../StructuredText";

export class ContentNormalizer {
  normalize(document: ContentDocument): ContentDocument {
    try {
      const markupNormalized = normalizeEditorialMarkupDocument({
        ...document,
        blocks: Object.freeze(document.blocks.map(normalizeContentBlockOwnership)),
      });
      const usedIds = new Set(
        markupNormalized.blocks.map((block) => block.id).filter(Boolean),
      );
      const remappedIds = new Map<string, readonly string[]>();
      let previousHeadingLevel: HeadingLevel | undefined;

      const blocks = markupNormalized.blocks.flatMap((block, index) => {
        const id = block.id || createBlockId(block.type, index, usedIds);
        if (block.type === "paragraph") {
          const normalized = normalizeParagraph(block, id, usedIds);
          if (block.id) remappedIds.set(block.id, Object.freeze(normalized.map((item) => item.id)));
          return normalized;
        }
        if (block.type === "table") {
          const table = normalizeStructuredTable(block);
          if (!table) {
            if (block.id) remappedIds.set(block.id, Object.freeze([]));
            return [];
          }
          const normalized = Object.freeze({ ...block, ...table, id, type: "table" as const });
          if (block.id) remappedIds.set(block.id, Object.freeze([id]));
          return [normalized];
        }
        if (block.type === "list") {
          const items = block.items.map((item) => normalizeStructuredText(item)).filter(Boolean);
          if (!items.length) {
            if (block.id) remappedIds.set(block.id, Object.freeze([]));
            return [];
          }
          const normalized = Object.freeze({ ...block, id, items: Object.freeze(items) });
          if (block.id) remappedIds.set(block.id, Object.freeze([id]));
          return [normalized];
        }

        const normalizedBlock = normalizeHeading(block, previousHeadingLevel, id);
        if (normalizedBlock.type === "heading") previousHeadingLevel = normalizedBlock.level;
        if (block.id) remappedIds.set(block.id, Object.freeze([id]));
        return [normalizedBlock];
      });

      const metadata = remapLongFormStructure(markupNormalized.metadata, remappedIds);
      return Object.freeze({
        ...markupNormalized,
        blocks: Object.freeze(blocks),
        ...(metadata ? { metadata } : {}),
      });
    } catch {
      return document;
    }
  }
}

function normalizeParagraph(
  block: Extract<ContentBlock, { type: "paragraph" }>,
  id: string,
  usedIds: Set<string>,
): ContentBlock[] {
  const segments = parseStructuredText(block.text);
  return segments.flatMap<ContentBlock>((segment, index) => {
    const segmentId = index === 0 ? id : createDerivedBlockId(id, segment.type, index + 1, usedIds);
    if (segment.type === "table") {
      return [Object.freeze({
        ...segment.table,
        ...(block.ownership ? { ownership: block.ownership } : {}),
        id: segmentId,
        type: "table" as const,
      })];
    }
    const list = parseStructuredList(segment.text);
    if (list) {
      const listId = list.prefix
        ? createDerivedBlockId(segmentId, "list", index + 1, usedIds)
        : segmentId;
      return [
        ...(list.prefix ? [Object.freeze({ ...block, id: segmentId, text: list.prefix })] : []),
        Object.freeze({
          id: listId,
          type: "list" as const,
          style: list.style,
          items: list.items,
          ...(block.ownership ? { ownership: block.ownership } : {}),
        }),
      ];
    }
    return segmentId === block.id && segment.text === block.text
      ? [block]
      : [Object.freeze({ ...block, id: segmentId, text: segment.text })];
  });
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

function remapLongFormStructure(
  metadata: ContentDocument["metadata"],
  remappedIds: ReadonlyMap<string, readonly string[]>,
): ContentDocument["metadata"] {
  const structure = metadata?.longFormStructure;
  if (!metadata || !structure) return metadata;
  const expand = (ids: readonly string[]) => Object.freeze(ids.flatMap((id) => remappedIds.get(id) ?? [id]));
  return Object.freeze({
    ...metadata,
    longFormStructure: Object.freeze({
      introductionBlockIds: expand(structure.introductionBlockIds),
      sections: Object.freeze(structure.sections.map((section) => Object.freeze({
        ...section,
        paragraphBlockIds: expand(section.paragraphBlockIds),
      }))),
      conclusionBlockIds: expand(structure.conclusionBlockIds),
    }),
  });
}

function createDerivedBlockId(
  base: string,
  type: "text" | "table" | "list",
  sequence: number,
  usedIds: Set<string>,
): string {
  let suffix = sequence;
  const label = type === "text" ? "paragraph" : type;
  let candidate = `${base}-${label}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${label}-${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
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
