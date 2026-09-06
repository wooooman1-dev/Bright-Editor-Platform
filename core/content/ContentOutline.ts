import type { ContentDocument } from "./ContentDocument";
import { isSystemProjectionBlock } from "./ContentBlockOwnership";

export type ContentOutlineEntry = Readonly<{
  id: string;
  level: 2 | 3;
  text: string;
}>;

export function createContentOutline(document: ContentDocument): readonly ContentOutlineEntry[] {
  return Object.freeze(document.blocks.flatMap((block) =>
    block.type === "heading"
      && (block.level === 2 || block.level === 3)
      && block.text.trim()
      && !isSystemProjectionBlock(block)
      ? [Object.freeze({ id: block.id, level: block.level, text: block.text.trim() })]
      : [],
  ));
}
