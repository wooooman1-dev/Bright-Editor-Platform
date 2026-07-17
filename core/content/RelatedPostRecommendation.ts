import type { ContentDocument } from "./ContentDocument";

export type PublicPostCandidate = Readonly<{ externalPostId: string; title: string; publishedUrl: string; categoryName?: string; publishedAt?: string; excerpt?: string; keywords?: readonly string[] }>;
export function rankRelatedPosts(document: ContentDocument, candidates: readonly PublicPostCandidate[], context: Readonly<{ primaryKeyword?: string; categoryName?: string }> = {}): readonly PublicPostCandidate[] {
  const used = new Set(document.blocks.flatMap((block) => block.type === "button" && block.targetUrl ? [normalizeUrl(block.targetUrl)] : []));
  const documentTerms = terms([document.title, context.primaryKeyword ?? "", ...document.blocks.flatMap((block) => block.type === "heading" ? [block.text] : [])].join(" "));
  return [...candidates].filter((candidate) => candidate.title.trim() && validPublicUrl(candidate.publishedUrl) && !used.has(normalizeUrl(candidate.publishedUrl)))
    .map((candidate) => ({ candidate, score: relevance(candidate, documentTerms, context.categoryName) }))
    .filter((item) => item.score >= 12)
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title, "ko"))
    .map(({ candidate }) => candidate);
}
export function placeRecommendedPosts(document: ContentDocument, ranked: readonly PublicPostCandidate[]): ContentDocument {
  if (!ranked.length) return document;
  const existingUrls = new Set(document.blocks.flatMap((block) => block.type === "button" && block.targetUrl ? [normalizeUrl(block.targetUrl)] : []));
  const available = ranked.filter((item) => !existingUrls.has(normalizeUrl(item.publishedUrl)));
  const blocks = [...document.blocks];
  if (!blocks.some((block) => block.type === "button" && block.purpose === "internal_link") && available[0]) {
    const headings = blocks.map((block, index) => block.type === "heading" && (block.level === 2 || block.level === 3) ? index : -1).filter((index) => index >= 0);
    const insertAt = (headings[Math.floor(headings.length / 2)] ?? Math.max(0, blocks.length - 1)) + 1;
    blocks.splice(insertAt, 0, { id: uniqueBlockId(blocks, "auto-internal-link"), type: "button", purpose: "internal_link", label: available[0].title, targetUrl: available[0].publishedUrl, target: "_self", sourceExternalPostId: available[0].externalPostId });
  }
  const used = new Set(blocks.flatMap((block) => block.type === "button" && block.targetUrl ? [normalizeUrl(block.targetUrl)] : []));
  if (!blocks.some((block) => block.type === "button" && block.purpose === "related_post")) for (const item of available.filter((candidate) => !used.has(normalizeUrl(candidate.publishedUrl))).slice(0, 3)) { blocks.push({ id: uniqueBlockId(blocks, "auto-related-post"), type: "button", purpose: "related_post", label: item.title, targetUrl: item.publishedUrl, target: "_self", sourceExternalPostId: item.externalPostId }); used.add(normalizeUrl(item.publishedUrl)); }
  return { ...document, blocks };
}
function uniqueBlockId(blocks: ContentDocument["blocks"], base: string) { const ids = new Set(blocks.map((block) => block.id)); let id = base, index = 2; while (ids.has(id)) id = `${base}-${index++}`; return id; }
function relevance(candidate: PublicPostCandidate, documentTerms: ReadonlySet<string>, categoryName?: string) { const titleTerms = terms(candidate.title); const allTerms = new Set([...titleTerms, ...(candidate.keywords ?? []).map(normalizeTerm)]); let score = 0; for (const term of allTerms) if (documentTerms.has(term)) score += titleTerms.has(term) ? 6 : 2; if (categoryName && candidate.categoryName === categoryName) score += 8; return score; }
const genericTerms = new Set(["가이드", "건강", "관리", "방법", "이유", "정리", "최신", "필요한", "위한", "좋은", "실전", "절약", "안전한", "비용", "병원"]);
function terms(value: string) { return new Set(value.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).map(normalizeTerm).filter((term) => term.length >= 2 && !genericTerms.has(term))); }
function normalizeTerm(value: string) { return value.trim().toLowerCase(); }
function normalizeUrl(value: string) { try { const url = new URL(value); url.hash = ""; return url.toString(); } catch { return value; } }
function validPublicUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" && /\.tistory\.com$/i.test(url.hostname) && url.pathname.startsWith("/entry/") && !url.pathname.includes("/manage"); } catch { return false; } }
