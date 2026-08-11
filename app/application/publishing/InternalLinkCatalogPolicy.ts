import {
  calculateContentMetrics,
  contentBlockOwnership,
  placeRecommendedPosts,
  rankRelatedPosts,
  type ContentDocument,
  type PublicPostCandidate,
} from "../../../core/content";
import type { UserContent, UserProject } from "../../user-flow/user-data";

/**
 * The publishing category a freshly generated article should use.
 *
 * `publishingCategoryIdentities` reads `content.publishingPreparation`, which is
 * written by the publishing preparation flow — that is, only once the user has
 * opened publishing for this article. A newly generated article therefore has
 * no category, internal link placement is skipped as `category_missing`, and
 * the links appear only after the candidate list is refreshed later. The
 * Project already declares the category to use for the account in
 * `defaultWordPressCategories`; this reads it when the content has none yet.
 *
 * The preparation flow still overwrites this with platform-validated
 * categories, so this never competes with a real selection: it only fills the
 * window between generating an article and opening its publishing panel.
 */
export function withProjectDefaultPublishingCategories(
  content: UserContent,
  project: UserProject | undefined,
): UserContent {
  if (content.publishingPreparation?.wordpress) return content;
  const accountId = content.publishingAccountId?.trim()
    ?? project?.strategy?.defaultPublishingAccountId?.trim();
  if (!accountId) return content;
  const categories = (project?.strategy?.defaultWordPressCategories ?? [])
    .filter((category) => category.publishingAccountId === accountId && category.id);
  if (!categories.length) return content;
  return Object.freeze({
    ...content,
    publishingPreparation: Object.freeze({
      ...content.publishingPreparation,
      wordpress: Object.freeze({
        publishingAccountId: accountId,
        categoryIds: Object.freeze(categories.map((category) => String(category.id))),
        categoryNames: Object.freeze(categories.map((category) => category.name ?? String(category.id))),
        updatedAt: content.updatedAt,
      }),
    }),
  });
}

export type PublishingCategoryIdentity = Readonly<{
  id?: string | null;
  name?: string | null;
}>;

export function publishingCategoryIdentities(
  content: UserContent,
): readonly PublishingCategoryIdentity[] {
  const wordpress = content.publishingPreparation?.wordpress;
  const tistory = content.publishingPreparation?.tistory;
  const activePlatform = activePublishingPlatform(content);
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

  if (activePlatform === "wordpress") {
    return wordpressMatchesActiveAccount ? wordpressCategories() : Object.freeze([]);
  }
  if (activePlatform === "tistory") {
    return tistoryMatchesActiveAccount && (tistory?.platformCategoryId || tistory?.platformCategoryName)
      ? tistoryCategories()
      : Object.freeze([]);
  }
  return Object.freeze([]);
}

export function internalLinkCatalogContextKey(
  content: UserContent,
  connectionId?: string,
): string {
  const categories = publishingCategoryIdentities(content)
    .map((category) => ({
      id: category.id == null ? null : normalizeIdentityValue(String(category.id)),
      name: category.name ? normalizeIdentityValue(category.name) : null,
    }))
    .sort((left, right) => `${left.id ?? ""}:${left.name ?? ""}`
      .localeCompare(`${right.id ?? ""}:${right.name ?? ""}`, "ko"));
  const activePlatform = activePublishingPlatform(content);
  const preparationAccount = activePlatform === "tistory"
    ? content.publishingPreparation?.tistory?.publishingAccountId
    : activePlatform === "wordpress"
      ? content.publishingPreparation?.wordpress?.publishingAccountId
      : undefined;
  return JSON.stringify({
    platform: activePlatform,
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
    contentBlockOwnership(block) !== "system_catalog");
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

function normalizeIdentityValue(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function activePublishingPlatform(content: UserContent): "wordpress" | "tistory" | "unknown" {
  if (content.platform === "wordpress" || content.platform === "tistory") return content.platform;
  const accountId = content.publishingAccountId?.trim();
  const wordpressMatches = Boolean(content.publishingPreparation?.wordpress
    && (!accountId || content.publishingPreparation.wordpress.publishingAccountId === accountId));
  const tistoryMatches = Boolean(content.publishingPreparation?.tistory
    && (!accountId || content.publishingPreparation.tistory.publishingAccountId === accountId));
  if (wordpressMatches !== tistoryMatches) return wordpressMatches ? "wordpress" : "tistory";
  return "unknown";
}
