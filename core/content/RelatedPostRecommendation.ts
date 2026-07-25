import type { ContentDocument } from "./ContentDocument";

export type PublicPostCandidate = Readonly<{ externalPostId: string; title: string; publishedUrl: string; categoryId?: string; categoryName?: string; publishedAt?: string; excerpt?: string; keywords?: readonly string[]; viewCount?: number }>;

export function rankRelatedPosts(document: ContentDocument, candidates: readonly PublicPostCandidate[], context: Readonly<{ primaryKeyword?: string; categoryId?: string | null; categoryName?: string }> = {}): readonly PublicPostCandidate[] {
  const categoryIdentity = resolveCategoryIdentity(context.categoryId, context.categoryName);
  if (!categoryIdentity) return Object.freeze([]);
  const used = new Set(document.blocks.flatMap((block) => block.type === "button" && block.targetUrl ? [normalizeUrl(block.targetUrl)] : []));
  const unique = new Map<string, PublicPostCandidate>();

  for (const candidate of candidates) {
    const normalizedUrl = normalizeUrl(candidate.publishedUrl);
    if (!sameCategory(candidate, categoryIdentity)) continue;
    if (!candidate.title.trim() || !validPublicUrl(candidate.publishedUrl) || used.has(normalizedUrl) || unique.has(normalizedUrl)) continue;
    unique.set(normalizedUrl, candidate);
  }

  return Object.freeze([...unique.values()]
    .sort((a, b) => validViewCount(b.viewCount) - validViewCount(a.viewCount) || publishedTime(b.publishedAt) - publishedTime(a.publishedAt) || a.title.localeCompare(b.title, "ko") || a.externalPostId.localeCompare(b.externalPostId)));
}

export function placeRecommendedPosts(document: ContentDocument, ranked: readonly PublicPostCandidate[]): ContentDocument {
  const normalized = normalizeMandatoryLinks(document.blocks);
  const relatedPosts: ContentDocument["blocks"][number][] = normalized.filter((block) => validPlacedLink(block, "related_post"));
  const blocks: ContentDocument["blocks"][number][] = normalized.filter((block) => !validPlacedLink(block, "related_post"));
  const existingUrls = new Set(normalized.flatMap((block) => block.type === "button" && block.targetUrl ? [normalizeUrl(block.targetUrl)] : []));
  const available = uniqueValidCandidates(ranked).filter((item) => !existingUrls.has(normalizeUrl(item.publishedUrl)));

  if (!blocks.some((block) => validPlacedLink(block, "internal_link")) && available[0]) {
    const headings = blocks.map((block, index) => block.type === "heading" && (block.level === 2 || block.level === 3) ? index : -1).filter((index) => index >= 0);
    const insertAt = (headings[Math.floor(headings.length / 2)] ?? Math.max(0, blocks.length - 1)) + 1;
    const candidate = available.shift()!;
    blocks.splice(insertAt, 0, { id: uniqueBlockId([...blocks, ...relatedPosts], "auto-internal-link"), type: "button", purpose: "internal_link", label: candidate.title, targetUrl: candidate.publishedUrl, target: "_self", sourceExternalPostId: candidate.externalPostId });
  }

  const used = new Set([...blocks, ...relatedPosts].flatMap((block) => block.type === "button" && block.targetUrl ? [normalizeUrl(block.targetUrl)] : []));
  const missingRelatedPosts = Math.max(0, 3 - relatedPosts.length);

  for (const item of available.filter((candidate) => !used.has(normalizeUrl(candidate.publishedUrl))).slice(0, missingRelatedPosts)) {
    relatedPosts.push({ id: uniqueBlockId([...blocks, ...relatedPosts], "auto-related-post"), type: "button", purpose: "related_post", label: item.title, targetUrl: item.publishedUrl, target: "_self", sourceExternalPostId: item.externalPostId });
    used.add(normalizeUrl(item.publishedUrl));
  }

  return { ...document, blocks: [...blocks, ...relatedPosts] };
}

function normalizeMandatoryLinks(blocks: ContentDocument["blocks"]): ContentDocument["blocks"][number][] {
  const relatedUrls = new Set<string>();
  return blocks.filter((block) => {
    if (block.type !== "button" || (block.purpose !== "internal_link" && block.purpose !== "related_post")) return true;
    if (!validPlacedLink(block, block.purpose)) return false;
    if (block.purpose === "internal_link") return true;
    const normalizedUrl = normalizeUrl(block.targetUrl);
    if (relatedUrls.has(normalizedUrl) || relatedUrls.size >= 3) return false;
    relatedUrls.add(normalizedUrl);
    return true;
  });
}

function uniqueValidCandidates(candidates: readonly PublicPostCandidate[]): PublicPostCandidate[] {
  const unique = new Map<string, PublicPostCandidate>();
  for (const candidate of candidates) {
    const normalizedUrl = normalizeUrl(candidate.publishedUrl);
    if (!candidate.title.trim() || !validPublicUrl(candidate.publishedUrl) || unique.has(normalizedUrl)) continue;
    unique.set(normalizedUrl, candidate);
  }
  return [...unique.values()];
}

function validPlacedLink(block: ContentDocument["blocks"][number], purpose: "internal_link" | "related_post"): block is Extract<ContentDocument["blocks"][number], { type: "button" }> {
  return block.type === "button" && block.purpose === purpose && Boolean(block.label.trim()) && validPublicUrl(block.targetUrl);
}

function uniqueBlockId(blocks: ContentDocument["blocks"], base: string) { const ids = new Set(blocks.map((block) => block.id)); let id = base, index = 2; while (ids.has(id)) id = `${base}-${index++}`; return id; }
function normalizeUrl(value: string) { try { const url = new URL(value); url.hash = ""; return url.toString(); } catch { return value; } }
function validPublicUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" && /\.tistory\.com$/i.test(url.hostname) && url.pathname.startsWith("/entry/") && !url.pathname.includes("/manage"); } catch { return false; } }
function publishedTime(value?: string) { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : 0; }
function validViewCount(value?: number) { return Number.isFinite(value) && (value ?? 0) > 0 ? value! : 0; }

type CategoryIdentity = Readonly<{ id?: string; normalizedNames: ReadonlySet<string> }>;
function resolveCategoryIdentity(categoryId?: string | null, categoryName?: string): CategoryIdentity | undefined {
  const id = categoryId == null ? undefined : String(categoryId).trim();
  const names = categoryNameVariants(categoryName);
  return id || names.size ? { ...(id ? { id } : {}), normalizedNames: names } : undefined;
}
function sameCategory(candidate: PublicPostCandidate, expected: CategoryIdentity): boolean {
  const candidateId = candidate.categoryId?.trim();
  if (expected.id) {
    if (!candidateId) return false;
    if (isNumericCategoryId(expected.id) && isNumericCategoryId(candidateId)) return expected.id === candidateId;
    if (isNumericCategoryId(expected.id) && !isNumericCategoryId(candidateId) && isLegacyNameCategoryId(candidateId, candidate.categoryName)) {
      return categoryNamesOverlap(categoryNameVariants(candidate.categoryName), expected.normalizedNames);
    }
    return expected.id === candidateId;
  }
  return categoryNamesOverlap(categoryNameVariants(candidate.categoryName), expected.normalizedNames);
}
function categoryNamesOverlap(candidateNames: ReadonlySet<string>, expectedNames: ReadonlySet<string>) {
  if (!candidateNames.size || !expectedNames.size) return false;
  return [...candidateNames].some((name) => expectedNames.has(name));
}
function isNumericCategoryId(value: string) { return /^\d+$/.test(value); }
function isLegacyNameCategoryId(categoryId: string, categoryName?: string) {
  const idNames = categoryNameVariants(categoryId);
  const names = categoryNameVariants(categoryName);
  return categoryNamesOverlap(idNames, names);
}
function categoryNameVariants(value?: string): ReadonlySet<string> {
  if (!value?.trim()) return new Set();
  const normalized = value.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const segments = normalized.split(/[>›/\\»]|\s+-\s+/u).map(normalizeCategoryName).filter(Boolean);
  const all = normalizeCategoryName(normalized);
  return new Set([all, ...segments, segments.at(-1) ?? ""].filter(Boolean));
}
function normalizeCategoryName(value: string) { return value.replace(/[\s·._-]+/gu, "").trim(); }
