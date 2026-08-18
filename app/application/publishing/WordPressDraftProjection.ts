import type { ContentDocument } from "../../../core/content";
import { contentRevisionId } from "../../../core/quality";
import type { WordPressSeoMetadata } from "../../../apps/wordpress";
import type { UserContent } from "../../user-flow/user-data";

export function resolveWordPressFeaturedImageAssetId(
  document: ContentDocument,
  explicitAssetId?: string,
): string | undefined {
  const explicit = explicitAssetId?.trim();
  if (explicit) {
    const matches = document.blocks.filter((block) =>
      block.type === "image" && block.assetId === explicit);
    if (matches.length !== 1) {
      throw new Error("The selected WordPress Featured Image must match exactly one Image Block.");
    }
    return explicit;
  }

  const heroCandidates = document.blocks.filter((block) =>
    block.type === "image"
    && block.purpose === "hero"
    && Boolean(block.assetId?.trim())
    && /^\/api\/media\//i.test(block.source));
  if (heroCandidates.length > 1) {
    throw new Error("WordPress Featured Image is ambiguous because multiple local Hero images exist.");
  }
  return heroCandidates[0]?.type === "image" ? heroCandidates[0].assetId : undefined;
}

export function projectWordPressBodyDocument(
  document: ContentDocument,
  featuredImageAssetId?: string,
): ContentDocument {
  const assetId = featuredImageAssetId?.trim();
  if (!assetId) return document;
  const matches = document.blocks.filter((block) =>
    block.type === "image" && block.assetId === assetId);
  if (matches.length !== 1) {
    throw new Error("The selected WordPress Featured Image must match exactly one Image Block.");
  }
  return Object.freeze({
    ...document,
    blocks: Object.freeze(document.blocks.filter((block) =>
      !(block.type === "image" && block.assetId === assetId))),
  });
}

export function resolveWordPressSeoMetadata(
  content: UserContent & Readonly<{ document: ContentDocument }>,
): WordPressSeoMetadata | undefined {
  const focusKeyphrase = (content.primaryKeyword ?? content.opportunity?.primaryKeyword ?? "").trim();
  const seoTitle = (content.document.metadata?.seoTitle ?? content.document.title).trim();
  const metaDescription = content.document.metadata?.metaDescription?.trim() ?? "";
  if (!focusKeyphrase && !metaDescription) return undefined;
  if (!focusKeyphrase || !seoTitle || !metaDescription) {
    throw new Error("Canonical WordPress SEO metadata is incomplete.");
  }
  return Object.freeze({ focusKeyphrase, seoTitle, metaDescription });
}

/**
 * Reproduces the exact pre-SEO content Revision algorithm used by publishing:v1
 * records. Keep this local to the WordPress migration boundary; new executions
 * must use contentRevisionId plus wordpressDraftExecutionRevisionId.
 */
export function legacyWordPressContentRevisionId(document: ContentDocument): string {
  return `rev-${executionHash(JSON.stringify({
    title: document.title,
    blocks: document.blocks,
  }))}`;
}

export type WordPressScheduleExecutionIdentity = Readonly<{
  scheduledAt: string;
  timezone: string;
  postStatus: "draft" | "future";
}>;

export function wordpressDraftExecutionRevisionId(
  content: UserContent & Readonly<{ document: ContentDocument }>,
  connectionId: string,
  slug?: string,
  schedule?: WordPressScheduleExecutionIdentity,
): string {
  const preparation = content.publishingPreparation?.wordpress?.publishingAccountId === connectionId
    ? content.publishingPreparation.wordpress
    : undefined;
  // The schedule key is omitted entirely when absent so existing non-scheduled
  // execution revisions keep their original hash.
  const source = JSON.stringify({
    contentRevisionId: contentRevisionId(content.document),
    focusKeyphrase: (content.primaryKeyword ?? content.opportunity?.primaryKeyword ?? "").trim(),
    seoTitle: (content.document.metadata?.seoTitle ?? content.document.title).trim(),
    metaDescription: content.document.metadata?.metaDescription?.trim() ?? "",
    categoryIds: normalizedExecutionIds(preparation?.categoryIds ?? []),
    featuredImageAssetId: featuredImageExecutionIdentity(
      content.document,
      preparation?.featuredImageAssetId,
    ),
    slug: slug?.trim() ?? "",
    ...(schedule
      ? {
        schedule: {
          scheduledAt: schedule.scheduledAt.trim(),
          timezone: schedule.timezone.trim(),
          postStatus: schedule.postStatus,
        },
      }
      : {}),
  });
  return `wordpress-draft-${executionHash(source)}`;
}

function normalizedExecutionIds(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort());
}

function featuredImageExecutionIdentity(
  document: ContentDocument,
  explicitAssetId?: string,
): string {
  const explicit = explicitAssetId?.trim();
  if (explicit) return `explicit:${explicit}`;

  const heroAssetIds = document.blocks.flatMap((block) =>
    block.type === "image"
    && block.purpose === "hero"
    && block.assetId?.trim()
    && /^\/api\/media\//i.test(block.source)
      ? [block.assetId.trim()]
      : [])
    .sort();
  if (heroAssetIds.length === 1) return `auto:${heroAssetIds[0]}`;
  if (heroAssetIds.length > 1) return `ambiguous:${heroAssetIds.join(",")}`;
  return "";
}

function executionHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function wordpressBodyMediaUrls(document: ContentDocument): readonly string[] {
  return Object.freeze(document.blocks.flatMap((block) =>
    block.type === "image" && /^https?:\/\//i.test(block.source)
      ? [block.source]
      : []));
}