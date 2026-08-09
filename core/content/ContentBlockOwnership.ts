import type { ContentBlock } from "./ContentBlock";

export const contentBlockOwnerships = [
  "system_catalog",
  "system_source_projection",
  "user_manual",
  "ai_editorial",
] as const;

export type ContentBlockOwnership = (typeof contentBlockOwnerships)[number];

/**
 * Resolves durable block ownership while conservatively recognizing only the
 * two legacy system ID families that Bright Studio itself created.
 */
export function contentBlockOwnership(
  block: ContentBlock,
): ContentBlockOwnership | undefined {
  if (block.ownership) return block.ownership;
  if (block.type === "button"
    && (block.purpose === "internal_link" || block.purpose === "related_post")
    && /^auto-(?:internal-link|related-post)(?:-\d+)?$/i.test(block.id)) {
    return "system_catalog";
  }
  if (generatedSourceProjectionId(block.id)) return "system_source_projection";
  return undefined;
}

export function normalizeContentBlockOwnership(block: ContentBlock): ContentBlock {
  const ownership = contentBlockOwnership(block);
  return ownership && block.ownership !== ownership
    ? Object.freeze({ ...block, ownership }) as ContentBlock
    : block;
}

export function isSystemProjectionBlock(block: ContentBlock): boolean {
  const ownership = contentBlockOwnership(block);
  return ownership === "system_catalog" || ownership === "system_source_projection";
}

function generatedSourceProjectionId(id: string): boolean {
  return id === "approval-sources-heading"
    || id === "approval-sources-summary"
    || id === "approval-review-date"
    || /^approval-source-link-\d+$/i.test(id);
}
