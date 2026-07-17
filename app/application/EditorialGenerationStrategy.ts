import { ensureSeoKeywordPlacement, type ContentDocument } from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";

export class EditorialGenerationStrategy implements ContentGenerationStrategy {
  createRequest(input: GenerationInput) {
    return {
      instruction: `Act as one integrated Korean editorial team: Content Strategist → Writer → SEO Specialist → Senior Editor → Image Strategist → Internal Link Planner → CTA Planner. For a health topic, also act as a conservative Medical Safety Reviewer. Make one editorial pass and write the complete publishable ${input.contentType} article for ${input.platform} about: ${input.keywords.join(", ")}.
Confirmed editorial context: ${input.editorialContext ?? "Use the supplied keywords and content type."}
Work internally in this order without exposing the work notes: analyze search intent and reader; define the direct answer; consider duplicate risk; plan information density per section; write the complete article; place image recommendations and only supplied real links; decide whether a CTA is genuinely useful; then edit the whole manuscript for accuracy, flow, repetition, and natural Korean.
Do not return an outline, plan, writing instructions, analysis, or placeholders as article prose. For a Tistory long-form article, write 4,500–6,000 Korean characters and five to eight developed H2 sections; use H3 only when it clarifies a subsection. After every H2 write two or three prose paragraphs, each with three to five connected sentences, so the section explains roughly 600–850 Korean characters rather than merely naming the topic. Before returning JSON, count the prose characters and expand concrete criteria, examples, common mistakes, cautions, or alternatives when the body is below 4,500 characters. Start with a substantive introduction that gives the core answer and end with a natural concise conclusion. Never leave a heading without developed prose.
Write polite, natural Korean as a knowledgeable person explaining the topic. Paragraphs normally contain 2–5 connected sentences. Avoid repeated one-sentence paragraphs, list-only writing, repeated “알아보겠습니다” or “중요합니다”, generic AI transitions, duplicated meanings, and every fabricated first-person experience (including “제가”, “저는”, and “직접 해봤습니다”). Do not force an FAQ.
Follow helpful, reliable, people-first Google Search principles and support E-E-A-T without pretending to have experience. Use the exact primary keyword naturally in the title, introduction, a relevant descriptive heading, body, meta description, image ALT, and link anchors; use secondary, long-tail, and related terms where useful, never by mechanical density or stuffing. Create a truthful 60–180-character meta description that explains what the reader will learn from the actual article without hype.
For health content, do not diagnose, promise effects, invent treatment advice, probabilities, research, or exact statistics. Distinguish urgent warning signs when relevant, recommend professional assessment when appropriate, and do not bury the useful answer under repeated disclaimers.
Place source-empty image recommendation blocks only where an image materially improves understanding, with a specific Korean ALT describing the subject and purpose. Decide whether CTA is useful; when useful place at most two CTA button blocks in context. Never invent a URL. If no approved CTA URL is known, use an empty targetUrl. Do not create internal, monetization, or related-post links unless their real approved URLs are supplied in the editorial context; Bright Studio will place verified catalog links separately.
Return JSON only: {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"blocks":[{"type":"heading","level":2,"text":"..."},{"type":"paragraph","text":"complete prose..."},{"type":"paragraph","text":"• list item 1\n• list item 2"},{"type":"image","source":"","alt":"specific image purpose"},{"type":"button","purpose":"cta","label":"구체적인 대상 페이지 설명","targetUrl":"","target":"_self"}]}.`,
    };
  }

  parse(response: string, input: GenerationInput): ContentDocument {
    const value = unwrapDocument(JSON.parse(stripFence(response))) as { title?: unknown; metaDescription?: unknown; primarySearchIntent?: unknown; secondaryIntent?: unknown; secondaryKeywords?: unknown; relatedTerms?: unknown; blocks?: unknown[] };
    if (typeof value.title !== "string" || !Array.isArray(value.blocks)) throw new Error("AI response is not a valid Content Model.");
    const parsedBlocks = normalizeLongFormHeadings(value.blocks.map((block, index) => parseBlock(block, index)), input);
    assertCompleteArticle(parsedBlocks, input);
    const blocks = ensureEditorialPlacement(parsedBlocks, input);
    const metadata = typeof value.metaDescription === "string" ? { buttonCount: blocks.filter((block) => block.type === "button").length, createdAt: new Date().toISOString(), generator: "editorial-generation", imageCount: blocks.filter((block) => block.type === "image").length, language: "ko", readingTime: Math.max(1, Math.ceil(blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0) / 1000)), source: "ai", updatedAt: new Date().toISOString(), version: 1, videoCount: blocks.filter((block) => block.type === "video").length, wordCount: blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.split(/\s+/).length, 0), metaDescription: value.metaDescription.trim(), ...(typeof value.primarySearchIntent === "string" ? { primarySearchIntent: value.primarySearchIntent.trim() } : {}), ...(typeof value.secondaryIntent === "string" ? { secondaryIntent: value.secondaryIntent.trim() } : {}), ...(Array.isArray(value.secondaryKeywords) ? { secondaryKeywords: value.secondaryKeywords.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.relatedTerms) ? { relatedTerms: value.relatedTerms.filter((item): item is string => typeof item === "string") } : {}) } : undefined;
    const document = Object.freeze({ blocks: Object.freeze(blocks), id: input.contentId ?? `content-${input.projectId}-${Date.now()}`, ...(metadata ? { metadata: Object.freeze(metadata) } : {}), title: value.title.trim() });
    return ensureSeoKeywordPlacement(document, input.keywords[0]);
  }
}

function unwrapDocument(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.title === "string" && Array.isArray(record.blocks)) return record;
  for (const key of ["document", "contentDocument", "finalDocument", "canonicalDocument", "content_document", "final_document", "canonical_document", "article"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).title === "string" && Array.isArray((candidate as Record<string, unknown>).blocks)) return candidate;
  }
  return record;
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
function assertCompleteArticle(blocks: ContentDocument["blocks"], input: GenerationInput): void {
  const headings = blocks.filter((block) => block.type === "heading");
  const h2 = headings.filter((block) => block.level === 2);
  const paragraphs = blocks.filter((block) => block.type === "paragraph");
  const proseLength = paragraphs.reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
  const fullText = paragraphs.map((block) => block.text).join("\n");
  const outlineOnly = paragraphs.length <= 2 && /(?:^|\n)\s*(?:\d+[.)]|[-•])\s*(?:인트로|소개|준비물|단계|결론|마무리)/im.test(fullText);
  const planningLanguage = /(?:작성할|다룰 예정|추가 예정|본문에서 설명|아웃라인|기획안|초안 지시|todo|tbd|placeholder)/i.test(fullText);
  const longForm = /tistory|blog|article|long-form|장문|guide/i.test(`${input.platform} ${input.contentType}`);
  const h2Indexes = blocks.flatMap((block, index) => block.type === "heading" && block.level === 2 ? [index] : []);
  const emptySection = h2Indexes.some((start, index) => {
    const end = h2Indexes[index + 1] ?? blocks.length;
    return !blocks.slice(start + 1, end).some((block) => block.type === "paragraph" && block.text.trim().length > 0);
  });
  if (headings.some((heading) => heading.level === 1) || headings.length < 3 || paragraphs.length < 5 || proseLength < 800 || outlineOnly || (planningLanguage && proseLength < 1800) || emptySection) throw new Error("AI returned a planning outline instead of a complete canonical article.");
  if (longForm && h2.length < 5) throw new Error("AI returned an invalid long-form section structure.");
}
function normalizeLongFormHeadings(blocks: ContentDocument["blocks"], input: GenerationInput): ContentDocument["blocks"] {
  if (!/tistory|blog|article|long-form|장문|guide/i.test(`${input.platform} ${input.contentType}`)) return blocks;
  let h2Count = 0;
  return blocks.map((block) => {
    if (block.type !== "heading" || block.level !== 2) return block;
    h2Count += 1;
    return h2Count <= 8 ? block : { ...block, level: 3 as const };
  });
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
