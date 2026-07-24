import {
  assertLongFormDocument,
  type ContentDocument,
} from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";
import { ensureDistinctImagePrompts } from "../../core/media";

export class EditorialGenerationStrategy implements ContentGenerationStrategy {
  createRequest(input: GenerationInput) {
    const opportunity = input.contentOpportunity;
    const opportunityContract = opportunity ? JSON.stringify({
      opportunityId: opportunity.opportunityId,
      version: opportunity.version,
      selectedTopic: opportunity.selectedTopic,
      primaryKeyword: opportunity.primaryKeyword,
      secondaryKeywords: opportunity.secondaryKeywords,
      searchIntent: opportunity.searchIntent,
      audience: opportunity.audience,
      readerProblem: opportunity.readerProblem,
      contentAngle: opportunity.contentAngle,
      expectedCoverage: opportunity.expectedCoverage,
      cautions: opportunity.cautions,
    }) : input.editorialContext ?? "Use the supplied keywords and content type.";
    return {
      instruction: `Act as one integrated Korean editorial team: Content Strategist → Writer → SEO Specialist → Senior Editor → Image Strategist → Internal Link Planner → CTA Planner. For a health topic, also act as a conservative Medical Safety Reviewer. Make one editorial pass and write the complete publishable ${input.contentType} article for ${input.platform} about: ${input.keywords.join(", ")}.
Canonical Content Opportunity: ${opportunityContract}
Treat this Opportunity as one indivisible editorial contract. The selected topic, primary keyword, search intent, supporting keywords, reader problem, angle, and expected coverage must describe the same article. Do not mix in another opportunity. Putting the primary keyword mechanically into an unrelated title is not compliance: the title, H2 structure, introduction, body majority, images, internal-link context, and CTA must answer this Opportunity. Use a supporting keyword only when its subject is actually explained. Do not change a user-specified topic. Avoid excluded topics and duplicate angles supplied in the context.
Work internally in this order without exposing the work notes: analyze search intent and reader; define the direct answer; select five or six distinct reader questions; assign one editorial purpose to each H2; plan information density per section; write the complete article; place image recommendations and only supplied real links; decide whether a CTA is genuinely useful; then edit the whole manuscript for accuracy, flow, repetition, and natural Korean.
Do not return an outline, plan, writing instructions, analysis, or placeholders as article prose. Return a structured article with introduction, sections, and conclusion as separate fields. Write exactly five substantive introduction paragraphs and exactly five substantive conclusion paragraphs; each paragraph should contain about 80–100 non-whitespace Korean prose characters so each boundary totals about 400–500. Write six developed H2 sections by default. Use five only when the topic genuinely has five distinct reader decisions. Every section must contain exactly eight developed paragraphs. With six H2 sections, each section paragraph should contain about 100–112 non-whitespace Korean prose characters so the section totals about 800–900. With five H2 sections, each section paragraph should contain about 115–125 non-whitespace Korean prose characters so the section totals about 920–1,000. Every H2 has an absolute minimum of 450 non-whitespace prose characters. The server hard floor is 4,800, but that is only a rejection boundary: the returned article must contain at least 5,500 non-whitespace prose characters and should target 6,000–6,500. The paragraph counts are enforced by the response schema and are part of the length contract, not optional formatting advice. Give every paragraph a distinct information role within its section, such as a criterion, sequence step, exception, error pattern, comparison, example, or next action; never split one padded thought merely to meet the count. These are information-density budgets, not permission to repeat or pad. Before returning the final JSON, internally measure every paragraph, every section, the introduction, the conclusion, and the complete prose after removing whitespace. Expand every deficient paragraph or section during this same response-writing process before returning JSON. This self-check is not a separate response or call. Never return a section below 450, a complete body below 5,500, fewer than five H2, or more than six H2. Repeated core advice is zero. Include at least three useful observable criteria, time or action sequence conditions, decision rules, or realistic application examples. Add useful depth through situation-specific distinctions, applicability, exceptions, common mistakes, or next actions. Do not add length by repeating, paraphrasing, stretching sentences, or adding meaningless summaries. For health content, never invent an unverified number, medical threshold, study, or diagnostic criterion merely to appear concrete.
Write polite, natural Korean as a knowledgeable person explaining the topic. Paragraphs must contain 2–4 connected sentences and should begin with varied, topic-specific wording. Do not use the stock phrases “알아보겠습니다”, “살펴보겠습니다”, “중요합니다”, “도움이 됩니다”, or “필수적입니다”. Avoid repeated one-sentence paragraphs, list-only writing, generic AI transitions, duplicated meanings, and every fabricated first-person experience (including “제가”, “저는”, and “직접 해봤습니다”). Do not force an FAQ. Prefer practical checklists only when they add information; do not replace developed prose with list-only blocks. The conclusion must summarize the reader's next action, the main decision criterion, and the most important caution in fresh wording.
Follow helpful, reliable, people-first Google Search principles and support E-E-A-T without pretending to have experience. Keyword placement is a mandatory completion contract, not a suggestion. Use the exact primary keyword naturally in the title, introduction, at least one relevant descriptive H2 or H3, the distributed body prose, the conclusion or summary, the meta description, and at least one relevant image ALT. Include every confirmed secondary keyword naturally in the section where its subject is actually explained. Distribute the primary and secondary keywords across the article instead of clustering them in one paragraph, and avoid keyword lists, awkward repetition, or stuffing. Before returning JSON, verify that no confirmed keyword is missing and that repetition still reads like natural Korean. Create a truthful 60–180-character meta description that explains what the reader will learn from the actual article without hype. Also return 5–10 concise Tistory post tags for the bottom tag field. Tags must be directly relevant, non-duplicative, not generic filler, and must not be inserted into the visible article body.
Reader usefulness is also a mandatory completion condition, not a vague preference. Every H2 must directly fulfill its own heading and editorial purpose, and provide new, non-duplicative information that the reader can use to understand, compare, judge, check, choose, or act. Select only the types of value that fit the section purpose: core concept or mechanism; causes and distinguishing criteria; situation-specific differences; selection or decision criteria; observable checks; steps or sequence; who the guidance applies to or does not apply to; exceptions; common mistakes; or a sensible next action. Do not force all of these into every section, but do not leave any H2 as generic explanation, restated title text, or abstract encouragement. Statements such as “꾸준한 관리가 중요합니다”, “건강한 생활 습관이 필요합니다”, “자신에게 맞는 방법을 선택해야 합니다”, “충분한 휴식과 균형 잡힌 식사가 중요합니다”, or “전문가와 상담하는 것이 좋습니다” may appear only when immediately followed by the concrete meaning, decision criterion, observable condition, application context, or next step. Each H2 must differ materially from every other section and must not pad length by paraphrasing the same idea. Consolidate repeated advice into the single section where it belongs, then use the freed space for deeper explanation, a concrete distinction, an example, or an actionable check. Replace vague phrases such as “잠시”, “일정 기간”, “필요한 경우”, or “상황에 따라” with a supported time, sequence, observable condition, decision rule, or example when reliable evidence is available. For health content, never invent a number or medical threshold merely to appear concrete; when an exact threshold is not supplied, state the observable condition, functional impact, persistence, exception, and appropriate next action without false precision. The conclusion must not merely repeat the body: it must help the reader choose a next decision or action based on the article's main criteria. Before returning JSON, self-check every H2 by asking: does this section directly fulfill its heading and editorial purpose; what new information does the reader gain; what concrete criterion or check can the reader use when appropriate; is this section distinct from all others; is its prose depth at least 450 non-whitespace characters; and did I avoid generic advice. If any answer is missing, revise that section before returning the article.
Safety and evidence integrity are mandatory completion conditions for every article, not optional style guidance. Never invent or imply a study, survey, statistic, percentage, probability, ranking, market volume, treatment effect, expert consensus, or causal claim unless that exact evidence and its approved source were supplied in the editorial context. Without supplied evidence, do not write phrases such as “연구에 따르면”, “통계에 따르면”, “입증되었습니다”, “대부분 효과가 있습니다”, or any precise number that presents an unsupported external fact. Never write first-person experience, product-use experience, treatment experience, or testimonial language unless the user explicitly supplied that experience as verified source material; do not write “제가”, “저는”, “직접 해보니”, “먹어봤더니”, or equivalent fabricated experience. Replace unsupported claims with accurate general explanation, observable criteria, conditional wording, or a clear statement that individual results can differ. For health content, do not diagnose, promise effects, invent treatment advice, probabilities, research, or exact statistics. Distinguish urgent warning signs when relevant, recommend professional assessment when appropriate, and do not bury the useful answer under repeated disclaimers. Before returning JSON, scan the complete manuscript and remove every unsupported evidence claim and fabricated experience. If even one remains, the article is incomplete and must not be returned.
Place source-empty image recommendation blocks only where an image materially improves understanding. Decide the count from the article type and actual visual need rather than placing one after every H2. A general informational article will often need only two or three purposeful images, while exercise, posture, step-by-step movement, comparison, or safety content may justify more. Remove any recommendation whose editorial role duplicates another image or whose information is already clear in prose. Every image block must include: a purpose selected from hero, inline, comparison, checklist, infographic, summary, or warning; a specific Korean ALT describing the subject and purpose; and a standalone production prompt detailed enough to create the image separately. Reflect the nearest H2 and its actual paragraph content in every image prompt. Within one article, never repeat the same subject, action, background, composition, or viewpoint combination. Decide whether CTA is useful; when useful place at most two CTA button blocks in context. Never invent a URL. If no approved CTA URL is known, use an empty targetUrl. Do not create internal, monetization, or related-post links unless their real approved URLs are supplied in the editorial context; Bright Studio will place verified catalog links separately.
Return JSON only in this exact generation shape: {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"tags":["티스토리태그1","티스토리태그2"],"introduction":["paragraph 1","paragraph 2","paragraph 3","paragraph 4","paragraph 5"],"sections":[{"heading":"H2 heading","paragraphs":["paragraph 1","paragraph 2","paragraph 3","paragraph 4","paragraph 5","paragraph 6","paragraph 7","paragraph 8"]}],"conclusion":["paragraph 1","paragraph 2","paragraph 3","paragraph 4","paragraph 5"],"images":[{"afterSection":0,"purpose":"hero","alt":"specific Korean ALT","prompt":"standalone image production prompt"}],"cta":[]}. afterSection is 0 for an image after the introduction or a 1-based section number. CTA items use {"afterSection":6,"purpose":"cta","label":"...","targetUrl":"","target":"_self"}. Do not return blocks from the generation call.`,
    };
  }

  parse(response: string, input: GenerationInput): ContentDocument {
    const value = unwrapDocument(JSON.parse(stripFence(response))) as GenerationDocument;
    if (typeof value.title !== "string") throw new Error("AI response is not a valid Content Model.");
    if (input.structuredLongFormOutput && !isStructuredGenerationDocument(value)) {
      throw new Error("AI response did not use the required structured long-form generation contract.");
    }
    const structured = isStructuredGenerationDocument(value);
    const converted = structured ? structuredBlocks(value) : undefined;
    if (!converted && !Array.isArray(value.blocks)) throw new Error("AI response is not a valid Content Model.");
    const parsedBlocks = converted?.blocks ?? normalizeLongFormHeadings(value.blocks!.map((block, index) => parseBlock(block, index)), input);
    if (!structured) assertCompleteArticle(parsedBlocks, input);
    const blocks = ensureEditorialPlacement(parsedBlocks, input);
    const metadata = typeof value.metaDescription === "string" ? { buttonCount: blocks.filter((block) => block.type === "button").length, createdAt: new Date().toISOString(), generator: "editorial-generation", imageCount: blocks.filter((block) => block.type === "image").length, language: "ko", readingTime: Math.max(1, Math.ceil(blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0) / 1000)), source: "ai", updatedAt: new Date().toISOString(), version: 1, videoCount: blocks.filter((block) => block.type === "video").length, wordCount: blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.split(/\s+/).length, 0), metaDescription: value.metaDescription.trim(), ...(typeof value.primarySearchIntent === "string" ? { primarySearchIntent: value.primarySearchIntent.trim() } : {}), ...(typeof value.secondaryIntent === "string" ? { secondaryIntent: value.secondaryIntent.trim() } : {}), ...(Array.isArray(value.secondaryKeywords) ? { secondaryKeywords: value.secondaryKeywords.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.relatedTerms) ? { relatedTerms: value.relatedTerms.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.tags) ? { tags: value.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10) } : {}) } : undefined;
    const longFormStructure = converted?.structure ?? (isLongForm(input) ? inferLongFormStructure(blocks) : undefined);
    const document = Object.freeze({
      blocks: Object.freeze(blocks),
      id: input.contentId ?? `content-${input.projectId}-${Date.now()}`,
      ...(metadata ? {
        metadata: Object.freeze({
          ...metadata,
          ...(longFormStructure ? { longFormStructure } : {}),
        }),
      } : {}),
      title: value.title.trim(),
    });
    const finalized = ensureDistinctImagePrompts(document, input.keywords[0]);
    if (isLongForm(input)) assertLongFormDocument(finalized);
    return finalized;
  }
}

function inferLongFormStructure(blocks: ContentDocument["blocks"]): NonNullable<NonNullable<ContentDocument["metadata"]>["longFormStructure"]> | undefined {
  const headingIndexes = blocks.flatMap((block, index) => block.type === "heading" && block.level === 2 ? [index] : []);
  if (!headingIndexes.length) return undefined;
  const firstHeading = headingIndexes[0];
  const introductionBlockIds = blocks.slice(0, firstHeading).flatMap((block) => block.type === "paragraph" ? [block.id] : []);
  const lastHeading = headingIndexes.at(-1)!;
  const trailingParagraphs = blocks.slice(lastHeading + 1).flatMap((block) => block.type === "paragraph" ? [block.id] : []);
  const conclusionBlockIds = trailingParagraphs.length ? [trailingParagraphs.at(-1)!] : [];
  const conclusionIds = new Set(conclusionBlockIds);
  const sections = headingIndexes.map((start, index) => {
    const heading = blocks[start];
    const end = headingIndexes[index + 1] ?? blocks.length;
    return Object.freeze({
      headingBlockId: heading.id,
      paragraphBlockIds: Object.freeze(blocks.slice(start + 1, end).flatMap((block) =>
        block.type === "paragraph" && !conclusionIds.has(block.id) ? [block.id] : [])),
    });
  });
  return Object.freeze({
    introductionBlockIds: Object.freeze(introductionBlockIds),
    sections: Object.freeze(sections),
    conclusionBlockIds: Object.freeze(conclusionBlockIds),
  });
}

type GenerationDocument = {
  title?: unknown;
  metaDescription?: unknown;
  primarySearchIntent?: unknown;
  secondaryIntent?: unknown;
  secondaryKeywords?: unknown;
  relatedTerms?: unknown;
  tags?: unknown;
  introduction?: unknown;
  sections?: unknown;
  conclusion?: unknown;
  images?: unknown;
  cta?: unknown;
  blocks?: unknown[];
};

type StructuredGenerationDocument = GenerationDocument & {
  title: string;
  introduction: string[];
  sections: Array<{ heading: string; paragraphs: string[] }>;
  conclusion: string[];
};

function isStructuredGenerationDocument(value: GenerationDocument): value is StructuredGenerationDocument {
  return Array.isArray(value.introduction)
    && value.introduction.every((item) => typeof item === "string")
    && Array.isArray(value.sections)
    && value.sections.every((item) => Boolean(item)
      && typeof item === "object"
      && typeof (item as { heading?: unknown }).heading === "string"
      && Array.isArray((item as { paragraphs?: unknown }).paragraphs)
      && (item as { paragraphs: unknown[] }).paragraphs.every((paragraph) => typeof paragraph === "string"))
    && Array.isArray(value.conclusion)
    && value.conclusion.every((item) => typeof item === "string");
}

function structuredBlocks(value: StructuredGenerationDocument): {
  blocks: ContentDocument["blocks"];
  structure: NonNullable<NonNullable<ContentDocument["metadata"]>["longFormStructure"]>;
} {
  const blocks: Array<ContentDocument["blocks"][number]> = [];
  const introductionBlockIds = value.introduction.map((text, index) => {
    const id = `introduction-${index + 1}`;
    blocks.push({ id, type: "paragraph", text });
    return id;
  });
  const imageValues = Array.isArray(value.images) ? value.images : [];
  appendPlacementBlocks(blocks, imageValues, Array.isArray(value.cta) ? value.cta : [], 0);
  const sections = value.sections.map((section, sectionIndex) => {
    const headingBlockId = `section-${sectionIndex + 1}-heading`;
    blocks.push({ id: headingBlockId, type: "heading", level: 2, text: section.heading });
    const paragraphBlockIds = section.paragraphs.map((text, paragraphIndex) => {
      const id = `section-${sectionIndex + 1}-paragraph-${paragraphIndex + 1}`;
      blocks.push({ id, type: "paragraph", text });
      return id;
    });
    appendPlacementBlocks(blocks, imageValues, Array.isArray(value.cta) ? value.cta : [], sectionIndex + 1);
    return Object.freeze({ headingBlockId, paragraphBlockIds: Object.freeze(paragraphBlockIds) });
  });
  const conclusionBlockIds = value.conclusion.map((text, index) => {
    const id = `conclusion-${index + 1}`;
    blocks.push({ id, type: "paragraph", text });
    return id;
  });
  return {
    blocks: Object.freeze(blocks),
    structure: Object.freeze({
      introductionBlockIds: Object.freeze(introductionBlockIds),
      sections: Object.freeze(sections),
      conclusionBlockIds: Object.freeze(conclusionBlockIds),
    }),
  };
}

function appendPlacementBlocks(
  blocks: Array<ContentDocument["blocks"][number]>,
  images: unknown[],
  ctas: unknown[],
  afterSection: number,
): void {
  for (const [index, item] of [...images, ...ctas].entries()) {
    if (!item || typeof item !== "object" || Number((item as { afterSection?: unknown }).afterSection) !== afterSection) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.alt === "string") {
      blocks.push(parseBlock({ ...record, type: "image", source: "" }, blocks.length + index));
    } else if (typeof record.label === "string") {
      blocks.push(parseBlock({ ...record, type: "button", targetUrl: typeof record.targetUrl === "string" ? record.targetUrl : "" }, blocks.length + index));
    }
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
  if (block.type === "image" && typeof block.alt === "string") return { alt: block.alt, id, source: typeof block.source === "string" ? block.source : "", type: "image", ...(typeof block.prompt === "string" ? { prompt: block.prompt.trim() } : {}), ...(normalizeImagePurpose(block.purpose) ? { purpose: normalizeImagePurpose(block.purpose) } : {}), ...(typeof block.assetId === "string" && block.assetId.trim() ? { assetId: block.assetId.trim() } : {}), ...(typeof block.fileName === "string" && block.fileName.trim() ? { fileName: block.fileName.trim() } : {}), ...(typeof block.mimeType === "string" && block.mimeType.trim() ? { mimeType: block.mimeType.trim() } : {}), ...(normalizeImageSourceType(block.sourceType) ? { sourceType: normalizeImageSourceType(block.sourceType) } : {}) };
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
  const sectionProseLengths = h2Indexes.map((start, index) => {
    const end = h2Indexes[index + 1] ?? blocks.length;
    return blocks.slice(start + 1, end).reduce((sum, block) => block.type === "paragraph" ? sum + block.text.replace(/\s/g, "").length : sum, 0);
  });
  const emptySection = sectionProseLengths.some((length) => length === 0);
  if (headings.some((heading) => heading.level === 1) || headings.length < 3 || paragraphs.length < 5 || proseLength < 800 || outlineOnly || (planningLanguage && proseLength < 1800) || emptySection) throw new Error("AI returned a planning outline instead of a complete canonical article.");
  if (longForm && (h2.length < 5 || h2.length > 6)) throw new Error("AI returned an invalid long-form H2 count; expected five to six developed sections.");
  if (longForm && sectionProseLengths.some((length) => length < 450)) throw new Error("AI returned a shallow long-form section; every H2 requires at least 450 non-whitespace prose characters.");
}

function normalizeLongFormHeadings(blocks: ContentDocument["blocks"], input: GenerationInput): ContentDocument["blocks"] {
  if (!isLongForm(input)) return blocks;
  return blocks;
}

function isLongForm(input: GenerationInput): boolean {
  return /tistory|blog|article|long-form|장문|guide/i.test(`${input.platform} ${input.contentType}`);
}

function ensureEditorialPlacement(blocks: ContentDocument["blocks"], input: GenerationInput): ContentDocument["blocks"] {
  const next = [...blocks];
  const headings = next.reduce<number[]>((indices, block, index) => block.type === "heading" ? [...indices, index] : indices, []);
  if (!next.some((block) => block.type === "image")) {
    const imageIndex = headings[Math.min(1, headings.length - 1)] ?? Math.min(2, next.length);
    const subject = `${input.keywords[0] ?? "본문"} 핵심 내용을 설명하는 추천 이미지`;
    next.splice(imageIndex, 0, { alt: subject, id: uniqueId(next, "generated-image-recommendation"), prompt: `${subject}. 한국 블로그 본문에 적합한 고품질 이미지, 핵심 대상이 분명한 구도, 자연스럽고 신뢰감 있는 스타일, 텍스트와 로고 없음.`, purpose: "inline", source: "", sourceType: "planned", type: "image" });
  }
  return next;
}

function uniqueId(blocks: ContentDocument["blocks"], base: string): string { const ids = new Set(blocks.map((block) => block.id)); let id = base; let suffix = 2; while (ids.has(id)) id = `${base}-${suffix++}`; return id; }
function normalizeLevel(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 { return typeof value === "number" && value >= 1 && value <= 6 ? value as 1 | 2 | 3 | 4 | 5 | 6 : 2; }
function normalizePurpose(value: unknown): "cta" | "internal_link" | "monetization" | "related_post" { return value === "internal_link" || value === "monetization" || value === "related_post" ? value : "cta"; }
function normalizeImagePurpose(value: unknown): "hero" | "comparison" | "checklist" | "infographic" | "summary" | "warning" | "inline" | undefined { return value === "hero" || value === "comparison" || value === "checklist" || value === "infographic" || value === "summary" || value === "warning" || value === "inline" ? value : undefined; }
function normalizeImageSourceType(value: unknown): "planned" | "upload" | "ai_generated" | "external" | undefined { return value === "planned" || value === "upload" || value === "ai_generated" || value === "external" ? value : undefined; }
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
