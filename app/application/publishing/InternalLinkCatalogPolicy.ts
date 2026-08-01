import {
  calculateContentMetrics,
  placeRecommendedPosts,
  rankRelatedPosts,
  type ContentDocument,
  type PublicPostCandidate,
} from "../../../core/content";
import type { UserContent } from "../../user-flow/user-data";

export type PublishingCategoryIdentity = Readonly<{
  id?: string | null;
  name?: string | null;
}>;

export function publishingCategoryIdentities(
  content: UserContent,
): readonly PublishingCategoryIdentity[] {
  const wordpress = content.publishingPreparation?.wordpress;
  if (wordpress) {
    return Object.freeze(wordpress.categoryIds.map((id, index) => Object.freeze({
      id,
      name: wordpress.categoryNames[index] ?? id,
    })));
  }

  const tistory = content.publishingPreparation?.tistory;
  if (tistory?.platformCategoryId || tistory?.platformCategoryName) {
    return Object.freeze([Object.freeze({
      id: tistory.platformCategoryId,
      name: tistory.platformCategoryName,
    })]);
  }

  return Object.freeze([]);
}

export function publishingCategoryNames(content: UserContent): readonly string[] {
  return Object.freeze([
    ...new Set(
      publishingCategoryIdentities(content)
        .map((category) => category.name?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ]);
}

export function publishingInternalLinkContextKey(
  content: UserContent,
  connectionId?: string,
): string {
  const wordpress = content.publishingPreparation?.wordpress;
  if (wordpress) {
    return JSON.stringify({
      platform: "wordpress",
      publishingAccountId: connectionId ?? wordpress.publishingAccountId,
      categories: wordpress.categoryIds.map((id, index) => ({
        id,
        name: wordpress.categoryNames[index] ?? id,
      })),
    });
  }

  const tistory = content.publishingPreparation?.tistory;
  return JSON.stringify({
    platform: "tistory",
    publishingAccountId: connectionId ?? tistory?.publishingAccountId ?? "",
    categories: tistory ? [{
      id: tistory.platformCategoryId,
      name: tistory.platformCategoryName,
    }] : [],
  });
}

export function removeAutoPlacedPublishingLinks(
  document: ContentDocument,
): ContentDocument {
  const blocks = document.blocks.filter((block) =>
    !(block.type === "button"
      && (block.purpose === "internal_link" || block.purpose === "related_post")
      && /^auto-(?:internal-link|related-post)(?:-\d+)?$/i.test(block.id)));
  return blocks.length === document.blocks.length
    ? document
    : { ...document, blocks: Object.freeze(blocks) };
}

export function rankPublishingPostCandidates(
  document: ContentDocument,
  candidates: readonly PublicPostCandidate[],
  content: UserContent,
): readonly PublicPostCandidate[] {
  const categories = publishingCategoryIdentities(content);
  if (!categories.length) return Object.freeze([]);

  const cleanDocument = removeAutoPlacedPublishingLinks(document);
  const unique = new Map<string, PublicPostCandidate>();
  for (const category of categories) {
    const ranked = rankRelatedPosts(cleanDocument, candidates, {
      primaryKeyword: content.primaryKeyword,
      categoryId: category.id,
      categoryName: category.name ?? undefined,
    });
    for (const candidate of ranked) {
      const key = normalizeUrl(candidate.publishedUrl);
      if (!unique.has(key)) unique.set(key, candidate);
    }
  }
  return Object.freeze([...unique.values()]);
}

export function applyInternalLinkCatalogResult(
  document: ContentDocument,
  ranked: readonly PublicPostCandidate[],
  status: "evaluated" | "category_missing" | "catalog_unavailable",
  contextKey?: string,
): ContentDocument {
  const cleanDocument = removeAutoPlacedPublishingLinks(document);
  const placed = status === "evaluated"
    ? placeRecommendedPosts(cleanDocument, ranked)
    : cleanDocument;
  return withInternalLinkCatalogMetadata(placed, ranked.length, status, contextKey);
}

export function withInternalLinkCatalogMetadata(
  document: ContentDocument,
  count: number,
  status: "evaluated" | "category_missing" | "catalog_unavailable",
  contextKey?: string,
): ContentDocument {
  const now = new Date().toISOString();
  const metrics = calculateContentMetrics(document);
  return {
    ...document,
    metadata: {
      buttonCount: document.blocks.filter((block) => block.type === "button").length,
      createdAt: document.metadata?.createdAt ?? now,
      generator: document.metadata?.generator ?? "bright-studio",
      imageCount:
        document.metadata?.imageCount
        ?? document.blocks.filter((block) => block.type === "image").length,
      language: document.metadata?.language ?? "ko",
      readingTime:
        document.metadata?.readingTime ?? metrics.estimatedReadingMinutes,
      source: document.metadata?.source ?? "generated",
      version: document.metadata?.version ?? 1,
      videoCount:
        document.metadata?.videoCount
        ?? document.blocks.filter((block) => block.type === "video").length,
      wordCount: document.metadata?.wordCount ?? metrics.wordUnits,
      ...document.metadata,
      buttonCount: document.blocks.filter((block) => block.type === "button").length,
      updatedAt: now,
      availableRelatedContentCandidates: count,
      internalLinkCatalogStatus: status,
      internalLinkCatalogContextKey: contextKey,
    },
  };
}

export function internalLinkCatalogChanged(
  before: ContentDocument,
  after: ContentDocument,
): boolean {
  if (before.blocks.length !== after.blocks.length) return true;
  if (before.blocks.some((block, index) =>
    JSON.stringify(block) !== JSON.stringify(after.blocks[index]))) return true;
  return before.metadata?.availableRelatedContentCandidates
      !== after.metadata?.availableRelatedContentCandidates
    || before.metadata?.internalLinkCatalogStatus
      !== after.metadata?.internalLinkCatalogStatus
    || before.metadata?.internalLinkCatalogContextKey
      !== after.metadata?.internalLinkCatalogContextKey;
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
