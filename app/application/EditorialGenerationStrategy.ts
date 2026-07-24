import {
  analyzeLongFormDocument,
  determineContentPlanQualityTarget,
  normalizeContentPlanQualityTarget,
  type ConfirmedContentOpportunity,
  type ContentSectionType,
  type ContentDocument,
} from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";
import { ensureDistinctImagePrompts } from "../../core/media";

export function contentOpportunityAIContext(opportunity: ConfirmedContentOpportunity) {
  const qualityTarget = normalizeContentPlanQualityTarget(opportunity.qualityTarget, {
    searchIntent: opportunity.searchIntent,
    contentType: opportunity.contentType,
    readerProblem: opportunity.readerProblem,
    audience: opportunity.audience,
    selectedTopic: opportunity.selectedTopic,
    expectedCoverage: opportunity.expectedCoverage,
  });
  return Object.freeze({
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
    qualityTarget,
  });
}

export class EditorialGenerationStrategy implements ContentGenerationStrategy {
  createRequest(input: GenerationInput) {
    const opportunity = input.contentOpportunity;
    const target = normalizeContentPlanQualityTarget(opportunity?.qualityTarget, {
      contentType: input.contentType,
      searchIntent: opportunity?.searchIntent,
      readerProblem: opportunity?.readerProblem,
      audience: opportunity?.audience,
      selectedTopic: opportunity?.selectedTopic,
      expectedCoverage: opportunity?.expectedCoverage,
    });
    const opportunityContract = opportunity
      ? JSON.stringify(contentOpportunityAIContext(opportunity))
      : input.editorialContext ?? "Use the supplied keywords and content type.";
    return {
      instruction: `Act as one integrated Korean editorial team: Content Strategist → Writer → SEO Specialist → Senior Editor → Image Strategist → Internal Link Planner → CTA Planner. For a health topic, also act as a conservative Medical Safety Reviewer. Make one editorial pass and write the complete publishable ${input.contentType} article for ${input.platform} about: ${input.keywords.join(", ")}.
Canonical Content Opportunity: ${opportunityContract}
Treat this Opportunity as one indivisible editorial contract. The selected topic, primary keyword, search intent, supporting keywords, reader problem, angle, and expected coverage must describe the same article. Do not mix in another opportunity. Putting the primary keyword mechanically into an unrelated title is not compliance: the title, H2 structure, introduction, body majority, images, internal-link context, and CTA must answer this Opportunity. Use a supporting keyword only when its subject is actually explained. Do not change a user-specified topic. Avoid excluded topics and duplicate angles supplied in the context.
  Work internally in this order without exposing the work notes: analyze search intent and reader problem; build a coverage map that assigns every planned core question and required content element to exactly one primary H2; select only the H2 sections needed to fulfill that map; assign one sectionType, reader question, and editorial purpose to each H2; write the complete article; place image recommendations and only supplied real links; decide whether a CTA is genuinely useful; then edit the whole manuscript for accuracy, flow, repetition, and natural Korean. A secondary section may refer to an earlier fact only when needed for context, but it must not re-explain that fact.
Do not return an outline, plan, writing instructions, analysis, or placeholders as article prose. Return a structured article with introduction, sections, and conclusion as separate fields. Planning information contract: ${JSON.stringify(target)}. The contentDepth is ${target.contentDepth}. Required content elements: ${target.requiredContentElements.join(" | ")}. Core questions: ${target.coreQuestions.join(" | ")}. Decision criteria: ${target.decisionCriteria.join(" | ")}. Examples needed: ${target.examplesNeeded.join(" | ")}. Warnings or exceptions: ${target.warningsOrExceptions.join(" | ")}. Actionable next steps: ${target.actionableNextSteps.join(" | ")}. Comparison needs: ${target.comparisonNeeds.join(" | ") || "none"}. Table needed: ${target.tableNeeds}. Checklist needed: ${target.checklistNeeds}. Scope boundaries: ${target.scopeBoundaries.join(" | ")}. Reader problem: ${target.readerProblem}. Topic complexity: ${target.topicComplexity}. Section guidance: ${JSON.stringify(target.sectionGuidance)}. Explain every required element until the reader can understand and apply it; merely naming an element is insufficient. Use a table, list, or checklist instead of long prose when it communicates the information more efficiently. Give every paragraph a distinct information role and never split or repeat one thought. Stop writing when the search intent, reader problem, required information, decisions, examples, cautions, and next action are sufficiently resolved. Prefer the shorter result when quality is equal. Never expand content only to make it longer. Before returning JSON, check every required element as missing, merely mentioned, or sufficiently explained, and repair only missing or insufficient information during this same response-writing process. This self-check is not a separate response or call. For health content, include causes or context, observation criteria, decision criteria, practical examples, and cautions when required by the plan, but never invent an unverified number, medical threshold, study, or diagnostic criterion.
Write polite, natural Korean as a knowledgeable person explaining the topic. Paragraphs must contain 2–4 connected sentences and should begin with varied, topic-specific wording. Do not use the stock phrases “알아보겠습니다”, “살펴보겠습니다”, “중요합니다”, “도움이 됩니다”, or “필수적입니다”. Avoid repeated one-sentence paragraphs, list-only writing, generic AI transitions, duplicated meanings, and every fabricated first-person experience (including “제가”, “저는”, and “직접 해봤습니다”). Do not force an FAQ. Prefer practical checklists only when they add information; do not replace developed prose with list-only blocks. The conclusion must summarize the reader's next action, the main decision criterion, and the most important caution in fresh wording.
Follow helpful, reliable, people-first Google Search principles and support E-E-A-T without pretending to have experience. Keyword placement is a mandatory completion contract, not a suggestion. Use the exact primary keyword naturally in the title, introduction, at least one relevant descriptive H2 or H3, the distributed body prose, the conclusion or summary, the meta description, and at least one relevant image ALT. Include every confirmed secondary keyword naturally in the section where its subject is actually explained. Distribute the primary and secondary keywords across the article instead of clustering them in one paragraph, and avoid keyword lists, awkward repetition, or stuffing. Before returning JSON, verify that no confirmed keyword is missing and that repetition still reads like natural Korean. Create a truthful 60–180-character meta description that explains what the reader will learn from the actual article without hype. Also return 5–10 concise Tistory post tags for the bottom tag field. Tags must be directly relevant, non-duplicative, not generic filler, and must not be inserted into the visible article body.
  Reader usefulness is also a mandatory completion condition, not a vague preference. Every H2 must directly fulfill its heading and declared sectionType and provide new, non-duplicative information. An explanation needs a direct answer, why it matters, and applicable conditions; a checklist needs distinct items with a reason or action; a comparison needs explicit criteria, differences, interpretation, and selection conditions; steps need ordered actions, conditions, and a usable outcome; a warning needs risk signals, exceptions, and next action; an FAQ needs complete answers; a summary may be shorter but must close the main decision; a case_example needs a concrete situation, decision, and application. One or two token sentences, heading-only sections, and repeated sentences always fail. For comparison content, a table, list, or checklist may replace some prose when it carries equal information density. Put cross-cutting advice such as recording results, checking the same conditions, avoiding self-diagnosis, or consulting a professional in the single section where it is most useful; do not repeat the same caution or next action in every H2. Before returning JSON, self-check each H2 against its sectionType guidance, confirm that it owns a distinct answer unavailable in the other sections, remove duplicated advice, and revise incomplete sections in this same response.
Safety and evidence integrity are mandatory completion conditions for every article, not optional style guidance. Never invent or imply a study, survey, statistic, percentage, probability, ranking, market volume, treatment effect, expert consensus, or causal claim unless that exact evidence and its approved source were supplied in the editorial context. Without supplied evidence, do not write phrases such as “연구에 따르면”, “통계에 따르면”, “입증되었습니다”, “대부분 효과가 있습니다”, or any precise number that presents an unsupported external fact. Never write first-person experience, product-use experience, treatment experience, or testimonial language unless the user explicitly supplied that experience as verified source material; do not write “제가”, “저는”, “직접 해보니”, “먹어봤더니”, or equivalent fabricated experience. Replace unsupported claims with accurate general explanation, observable criteria, conditional wording, or a clear statement that individual results can differ. For health content, do not diagnose, promise effects, invent treatment advice, probabilities, research, or exact statistics. Distinguish urgent warning signs when relevant, recommend professional assessment when appropriate, and do not bury the useful answer under repeated disclaimers. Before returning JSON, scan the complete manuscript and remove every unsupported evidence claim and fabricated experience. If even one remains, the article is incomplete and must not be returned.
Place source-empty image recommendation blocks only where an image materially improves understanding. Decide the count from the article type and actual visual need rather than placing one after every H2. A general informational article will often need only two or three purposeful images, while exercise, posture, step-by-step movement, comparison, or safety content may justify more. Remove any recommendation whose editorial role duplicates another image or whose information is already clear in prose. Every image block must include: a purpose selected from hero, inline, comparison, checklist, infographic, summary, or warning; a specific Korean ALT describing the subject and purpose; and a standalone production prompt detailed enough to create the image separately. Reflect the nearest H2 and its actual paragraph content in every image prompt. Within one article, never repeat the same subject, action, background, composition, or viewpoint combination. Decide whether CTA is useful; when useful place at most two CTA button blocks in context. Never invent a URL. If no approved CTA URL is known, use an empty targetUrl. Do not create internal, monetization, or related-post links unless their real approved URLs are supplied in the editorial context; Bright Studio will place verified catalog links separately.
Return JSON only in this exact generation shape: {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"tags":["티스토리태그1","티스토리태그2"],"introduction":["paragraph"],"sections":[{"heading":"H2 heading","sectionType":"explanation","paragraphs":["paragraph"]}],"conclusion":["paragraph"],"images":[{"afterSection":0,"purpose":"hero","alt":"specific Korean ALT","prompt":"standalone image production prompt"}],"cta":[]}. sectionType must be one of explanation, checklist, comparison, steps, warning, faq, summary, case_example. afterSection is 0 for placement after the introduction or a 1-based section number. CTA items use {"afterSection":0,"purpose":"cta","label":"...","targetUrl":"","target":"_self"}. Do not return blocks from the generation call.`,
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
    if (!structured) assertCompleteArticle(parsedBlocks);
    const blocks = ensureEditorialPlacement(parsedBlocks, input);
    const qualityTarget = input.contentOpportunity?.qualityTarget ?? determineContentPlanQualityTarget({ contentType: input.contentType });
    const metadata = typeof value.metaDescription === "string" ? { buttonCount: blocks.filter((block) => block.type === "button").length, createdAt: new Date().toISOString(), generator: "editorial-generation", imageCount: blocks.filter((block) => block.type === "image").length, language: "ko", readingTime: Math.max(1, Math.ceil(blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0) / 1000)), source: "ai", updatedAt: new Date().toISOString(), version: 1, videoCount: blocks.filter((block) => block.type === "video").length, wordCount: blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.split(/\s+/).length, 0), ...(input.contentOpportunity ? { qualityTarget } : {}), metaDescription: value.metaDescription.trim(), ...(typeof value.primarySearchIntent === "string" ? { primarySearchIntent: value.primarySearchIntent.trim() } : {}), ...(typeof value.secondaryIntent === "string" ? { secondaryIntent: value.secondaryIntent.trim() } : {}), ...(Array.isArray(value.secondaryKeywords) ? { secondaryKeywords: value.secondaryKeywords.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.relatedTerms) ? { relatedTerms: value.relatedTerms.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.tags) ? { tags: value.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10) } : {}) } : undefined;
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
    if (isLongForm(input) && input.contentOpportunity) {
      const diagnostic = analyzeLongFormDocument(finalized, qualityTarget);
      return Object.freeze({ ...finalized, metadata: Object.freeze({ ...finalized.metadata!, qualityTarget, generationDiagnostic: diagnostic }) });
    }
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
      sectionType: normalizeSectionType(heading.type === "heading" ? inferSectionType(heading.text) : undefined),
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
  sections: Array<{ heading: string; sectionType?: ContentSectionType; paragraphs: string[] }>;
  conclusion: string[];
};

function isStructuredGenerationDocument(value: GenerationDocument): value is StructuredGenerationDocument {
  return Array.isArray(value.introduction)
    && value.introduction.every((item) => typeof item === "string")
    && Array.isArray(value.sections)
    && value.sections.every((item) => Boolean(item)
      && typeof item === "object"
      && typeof (item as { heading?: unknown }).heading === "string"
      && (typeof (item as { sectionType?: unknown }).sectionType === "undefined" || typeof (item as { sectionType?: unknown }).sectionType === "string")
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
    return Object.freeze({ headingBlockId, paragraphBlockIds: Object.freeze(paragraphBlockIds), sectionType: normalizeSectionType(section.sectionType) });
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

function assertCompleteArticle(blocks: ContentDocument["blocks"]): void {
  const headings = blocks.filter((block) => block.type === "heading");
  const h2 = headings.filter((block) => block.level === 2);
  const paragraphs = blocks.filter((block) => block.type === "paragraph");
  const fullText = paragraphs.map((block) => block.text).join("\n");
  const outlineOnly = paragraphs.length <= 2 && /(?:^|\n)\s*(?:\d+[.)]|[-•])\s*(?:인트로|소개|준비물|단계|결론|마무리)/im.test(fullText);
  const planningLanguage = /(?:작성할|다룰 예정|추가 예정|본문에서 설명|아웃라인|기획안|초안 지시|todo|tbd|placeholder)/i.test(fullText);
  const h2Indexes = blocks.flatMap((block, index) => block.type === "heading" && block.level === 2 ? [index] : []);
  const sectionHasContent = h2Indexes.map((start, index) => {
    const end = h2Indexes[index + 1] ?? blocks.length;
    return blocks.slice(start + 1, end).some((block) =>
      block.type === "paragraph" ? Boolean(block.text.trim()) : block.type === "image" || block.type === "button");
  });
  const emptySection = sectionHasContent.some((hasContent) => !hasContent);
  if (headings.some((heading) => heading.level === 1) || h2.length === 0 || paragraphs.length === 0 || outlineOnly || planningLanguage || emptySection) {
    throw new Error("AI returned a planning outline or incomplete canonical article.");
  }
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
function normalizeSectionType(value: unknown): ContentSectionType {
  return value === "checklist" || value === "comparison" || value === "steps" || value === "warning" || value === "faq" || value === "summary" || value === "case_example" ? value : "explanation";
}
function inferSectionType(heading: string): ContentSectionType {
  if (/체크|목록|준비물/.test(heading)) return "checklist";
  if (/비교|차이|장단점/.test(heading)) return "comparison";
  if (/단계|순서|방법|실천/.test(heading)) return "steps";
  if (/주의|위험|경고|예외/.test(heading)) return "warning";
  if (/질문|FAQ|궁금/.test(heading)) return "faq";
  if (/요약|정리|결론/.test(heading)) return "summary";
  if (/사례|예시|상황/.test(heading)) return "case_example";
  return "explanation";
}
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
