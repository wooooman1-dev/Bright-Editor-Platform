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
  const tistory = content.publishingPreparation?.tistory;
  const activeAccountId = content.publishingAccountId?.trim();
  const wordpressMatchesActiveAccount = Boolean(wordpress
    && (!activeAccountId || wordpress.publishingAccountId === activeAccountId));
  const tistoryMatchesActiveAccount = Boolean(tistory
    && (!activeAccountId || tistory.publishingAccountId === activeAccountId));
  const wordpressCategories = () => Object.freeze(wordpress!.categoryIds.map((id, index) => Object.freeze({
    id,
    name: wordpress!.categoryNames[index] ?? id,
  })));
  const tistoryCategories = () => Object.freeze([Object.freeze({
    id: tistory!.platformCategoryId,
    name: tistory!.platformCategoryName,
  })]);

  if (content.platform === "wordpress") {
    return wordpressMatchesActiveAccount ? wordpressCategories() : Object.freeze([]);
  }
  if (content.platform === "tistory") {
    return tistoryMatchesActiveAccount && (tistory?.platformCategoryId || tistory?.platformCategoryName)
      ? tistoryCategories()
      : Object.freeze([]);
  }
  if (wordpress) return wordpressCategories();
  if (tistory?.platformCategoryId || tistory?.platformCategoryName) return tistoryCategories();
  return Object.freeze([]);
}

export function internalLinkCatalogContextKey(
  content: UserContent,
  connectionId?: string,
): string {
  const categories = publishingCategoryIdentities(content)
    .map((category) => ({
      id: category.id == null ? null : String(category.id),
      name: category.name?.trim() ?? null,
    }))
    .sort((left, right) => `${left.id ?? ""}:${left.name ?? ""}`
      .localeCompare(`${right.id ?? ""}:${right.name ?? ""}`, "ko"));
  const preparationAccount = content.platform === "tistory"
    ? content.publishingPreparation?.tistory?.publishingAccountId
    : content.platform === "wordpress"
      ? content.publishingPreparation?.wordpress?.publishingAccountId
      : content.publishingPreparation?.wordpress?.publishingAccountId
        ?? content.publishingPreparation?.tistory?.publishingAccountId;
  return JSON.stringify({
    platform: content.platform
      ?? (content.publishingPreparation?.wordpress
        ? "wordpress"
        : content.publishingPreparation?.tistory ? "tistory" : "unknown"),
    publishingAccountId: connectionId
      ?? content.publishingAccountId
      ?? preparationAccount
      ?? "",
    categories,
  });
}

/** Backward-compatible alias for callers added during the audit. */
export const publishingInternalLinkContextKey = internalLinkCatalogContextKey;

export function internalLinkCatalogContextIsCurrent(
  content: UserContent,
  document: ContentDocument,
  connectionId?: string,
): boolean {
  const status = document.metadata?.internalLinkCatalogStatus;
  if (!status
    || document.metadata?.internalLinkCatalogContextKey
      !== internalLinkCatalogContextKey(content, connectionId)) {
    return false;
  }
  const hasCategories = publishingCategoryIdentities(content).length > 0;
  if (hasCategories && status === "category_missing") return false;
  if (!hasCategories && status !== "category_missing") return false;
  return true;
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
      ...(contextKey ? { internalLinkCatalogContextKey: contextKey } : {}),
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
