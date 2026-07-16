import type { ContentDocument } from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";

export class EditorialGenerationStrategy implements ContentGenerationStrategy {
  createRequest(input: GenerationInput) {
    return {
      instruction: `Write the complete publishable ${input.contentType} article for ${input.platform} about: ${input.keywords.join(", ")}.
Confirmed editorial context: ${input.editorialContext ?? "Use the supplied keywords and content type."}
Do not return an outline, plan, writing instructions, analysis, or placeholders as article prose. Write a substantive introduction, at least five developed sections with useful paragraphs and list-style paragraphs where appropriate, and a concrete conclusion. Place image recommendation blocks at their intended positions. Decide whether CTA is useful; when useful place at most two CTA button blocks in context (normally one in the middle and one near the conclusion). Never invent a URL. If no approved URL is known, use an empty targetUrl so the Editor shows URL input required. Do not create internal, monetization, or related-post links unless their real approved URLs are supplied in the editorial context.
Follow helpful, reliable, people-first Google Search principles. Answer the primary search intent directly, use the primary keyword naturally without stuffing, keep the document title as the only H1, use sequential H2/H3 headings, provide concrete examples or a practical checklist, never claim personal experience not supplied by the user, and never invent statistics or unsupported facts. Create a truthful meta description that summarizes the actual article.
Return JSON only: {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"blocks":[{"type":"heading","level":2,"text":"..."},{"type":"paragraph","text":"complete prose..."},{"type":"paragraph","text":"• list item 1\n• list item 2"},{"type":"image","source":"","alt":"specific image purpose"},{"type":"button","purpose":"cta","label":"구체적인 대상 페이지 설명","targetUrl":"","target":"_self"}]}.`,
    };
  }

  parse(response: string, input: GenerationInput): ContentDocument {
    const value = JSON.parse(stripFence(response)) as { title?: unknown; metaDescription?: unknown; primarySearchIntent?: unknown; secondaryIntent?: unknown; secondaryKeywords?: unknown; relatedTerms?: unknown; blocks?: unknown[] };
    if (typeof value.title !== "string" || !Array.isArray(value.blocks)) throw new Error("AI response is not a valid Content Model.");
    const parsedBlocks = value.blocks.map((block, index) => parseBlock(block, index));
    assertCompleteArticle(parsedBlocks);
    const blocks = ensureEditorialPlacement(parsedBlocks, input);
    const metadata = typeof value.metaDescription === "string" ? { buttonCount: blocks.filter((block) => block.type === "button").length, createdAt: new Date().toISOString(), generator: "editorial-generation", imageCount: blocks.filter((block) => block.type === "image").length, language: "ko", readingTime: Math.max(1, Math.ceil(blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0) / 1000)), source: "ai", updatedAt: new Date().toISOString(), version: 1, videoCount: blocks.filter((block) => block.type === "video").length, wordCount: blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.split(/\s+/).length, 0), metaDescription: value.metaDescription.trim(), ...(typeof value.primarySearchIntent === "string" ? { primarySearchIntent: value.primarySearchIntent.trim() } : {}), ...(typeof value.secondaryIntent === "string" ? { secondaryIntent: value.secondaryIntent.trim() } : {}), ...(Array.isArray(value.secondaryKeywords) ? { secondaryKeywords: value.secondaryKeywords.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.relatedTerms) ? { relatedTerms: value.relatedTerms.filter((item): item is string => typeof item === "string") } : {}) } : undefined;
    return Object.freeze({ blocks: Object.freeze(blocks), id: input.contentId ?? `content-${input.projectId}-${Date.now()}`, ...(metadata ? { metadata: Object.freeze(metadata) } : {}), title: value.title.trim() });
  }
}

function parseBlock(value: unknown, index: number): ContentDocument["blocks"][number] {
  if (!value || typeof value !== "object" || !("type" in value)) throw new Error("AI returned an invalid content block.");
  const block = value as Record<string, unknown>;
  const id = typeof block.id === "string" && block.id.trim() ? block.id.trim() : `block-${index + 1}`;
  if (block.type === "heading" && typeof block.text === "string") return { id, level: normalizeLevel(block.level), text: block.text, type: "heading" };
  if (block.type === "paragraph" && typeof block.text === "string") return { id, text: block.text, type: "paragraph" };
  if (block.type === "image" && typeof block.alt === "string") return { alt: block.alt, id, source: typeof block.source === "string" ? block.source : "", type: "image" };
  if (block.type === "button" && typeof block.label === "string" && typeof block.targetUrl === "string") return { id, label: block.label, purpose: normalizePurpose(block.purpose), target: block.target === "_blank" ? "_blank" : "_self", targetUrl: block.targetUrl, ...(typeof block.sourceExternalPostId === "string" && block.sourceExternalPostId.trim() ? { sourceExternalPostId: block.sourceExternalPostId.trim() } : {}), type: "button" };
  throw new Error(`AI returned unsupported block ${index + 1}.`);
}
function assertCompleteArticle(blocks: ContentDocument["blocks"]): void {
  const headings = blocks.filter((block) => block.type === "heading");
  const paragraphs = blocks.filter((block) => block.type === "paragraph");
  const proseLength = paragraphs.reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
  const outlineOnly = paragraphs.length <= 2 && /(?:^|\n)\s*(?:\d+[.)]|[-•])\s*(?:인트로|소개|준비물|단계|결론|마무리)/im.test(paragraphs.map((block) => block.text).join("\n"));
  if (headings.length < 3 || paragraphs.length < 5 || proseLength < 800 || outlineOnly) throw new Error("AI returned a planning outline instead of a complete canonical article.");
}
function ensureEditorialPlacement(blocks: ContentDocument["blocks"], input: GenerationInput): ContentDocument["blocks"] {
  const next = [...blocks];
  const headings = next.reduce<number[]>((indices, block, index) => block.type === "heading" ? [...indices, index] : indices, []);
  if (!next.some((block) => block.type === "image")) {
    const imageIndex = headings[Math.min(1, headings.length - 1)] ?? Math.min(2, next.length);
    next.splice(imageIndex, 0, { alt: `${input.keywords[0] ?? "본문"} 핵심 내용을 설명하는 추천 이미지`, id: uniqueId(next, "generated-image-recommendation"), source: "", type: "image" });
  }
  return next;
}
function uniqueId(blocks: ContentDocument["blocks"], base: string): string {
  const ids = new Set(blocks.map((block) => block.id));
  let id = base; let suffix = 2;
  while (ids.has(id)) id = `${base}-${suffix++}`;
  return id;
}
function normalizeLevel(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 { return typeof value === "number" && value >= 1 && value <= 6 ? value as 1 | 2 | 3 | 4 | 5 | 6 : 2; }
function normalizePurpose(value: unknown): "cta" | "internal_link" | "monetization" | "related_post" { return value === "internal_link" || value === "monetization" || value === "related_post" ? value : "cta"; }
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
