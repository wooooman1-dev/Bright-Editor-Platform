import type { ContentBlock } from "./ContentBlock";
import type { ContentDocument } from "./ContentDocument";
import type { ButtonBlock } from "./blocks/ButtonBlock";

type MandatoryLinkPurpose = "internal_link" | "related_post";
type ProtectedLink = Readonly<{ anchorId?: string; block: ButtonBlock; index: number }>;

export function restoreVerifiedEditorialLinks(base: ContentDocument, candidate: ContentDocument): ContentDocument {
  const protectedLinks = collectProtectedLinks(base.blocks);
  const blocks = candidate.blocks.filter((block) => !isMandatoryLink(block));
  const internalLinks = protectedLinks.filter((item) => item.block.purpose === "internal_link");
  const relatedPosts = protectedLinks.filter((item) => item.block.purpose === "related_post").slice(0, 3);

  for (const item of internalLinks) {
    const insertAt = resolveInternalLinkPosition(blocks, item.anchorId);
    blocks.splice(insertAt, 0, item.block);
  }
  blocks.push(...relatedPosts.map((item) => item.block));

  return { ...candidate, blocks };
}

export function isVerifiedEditorialLink(block: ContentBlock): block is ButtonBlock & Readonly<{ purpose: MandatoryLinkPurpose }> {
  if (!isMandatoryLink(block) || !block.label.trim()) return false;
  try {
    const url = new URL(block.targetUrl);
    return url.protocol === "https:" && !/\/manage(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function collectProtectedLinks(blocks: readonly ContentBlock[]): ProtectedLink[] {
  const seen = new Set<string>();
  return blocks.flatMap((block, index) => {
    if (!isVerifiedEditorialLink(block)) return [];
    const key = `${block.purpose}:${normalizeUrl(block.targetUrl)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ block, index, ...(block.purpose === "internal_link" ? { anchorId: nearestAnchorId(blocks, index) } : {}) }];
  });
}

function nearestAnchorId(blocks: readonly ContentBlock[], index: number): string | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const block = blocks[current];
    if (!isMandatoryLink(block)) return block.id;
  }
  return undefined;
}

function resolveInternalLinkPosition(blocks: ContentBlock[], anchorId?: string): number {
  if (anchorId) {
    const anchorIndex = blocks.findIndex((block) => block.id === anchorId);
    if (anchorIndex >= 0) {
      let insertAt = anchorIndex + 1;
      while (insertAt < blocks.length && blocks[insertAt].type === "button" && blocks[insertAt].purpose === "internal_link") insertAt += 1;
      return insertAt;
    }
  }
  const headings = blocks.flatMap((block, index) => block.type === "heading" && (block.level === 2 || block.level === 3) ? [index] : []);
  return (headings[Math.floor(headings.length / 2)] ?? Math.max(0, blocks.length - 1)) + 1;
}

function isMandatoryLink(block: ContentBlock): block is ButtonBlock & Readonly<{ purpose: MandatoryLinkPurpose }> {
  return block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post");
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}
