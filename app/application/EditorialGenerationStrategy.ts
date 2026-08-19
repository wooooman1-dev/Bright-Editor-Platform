import {
  analyzeLongFormDocument,
  ContentNormalizer,
  determineContentPlanQualityTarget,
  normalizeGeneratedSectionSemantics,
  normalizeContentPlanQualityTarget,
  normalizeStructuredTable,
  type ConfirmedContentOpportunity,
  type ContentSectionType,
  type ContentDocument,
} from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";
import { applyGeneratedImageCostPolicy, ensureDistinctImagePrompts } from "../../core/media";

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
Do not return an outline, plan, writing instructions, analysis, or placeholders as article prose. Return a structured article with introduction, sections, and conclusion as separate fields. Planning information contract: ${JSON.stringify(target)}. The contentDepth is ${target.contentDepth}. Required content elements: ${target.requiredContentElements.join(" | ")}. Core questions: ${target.coreQuestions.join(" | ")}. Decision criteria: ${target.decisionCriteria.join(" | ")}. Examples needed: ${target.examplesNeeded.join(" | ")}. Warnings or exceptions: ${target.warningsOrExceptions.join(" | ")}. Actionable next steps: ${target.actionableNextSteps.join(" | ")}. Comparison needs: ${target.comparisonNeeds.join(" | ") || "none"}. Table needed: ${target.tableNeeds}. Checklist needed: ${target.checklistNeeds}. Scope boundaries: ${target.scopeBoundaries.join(" | ")}. Reader problem: ${target.readerProblem}. Topic complexity: ${target.topicComplexity}. Section guidance: ${JSON.stringify(target.sectionGuidance)}. Explain every required element until the reader can understand and apply it; merely naming an element is insufficient. Choose the representation by information type: ordinary explanation stays prose; a checklist uses an unordered list; sequential action uses an ordered list; warning or summary uses a concise section with its matching sectionType; and a table is reserved for genuine multi-column comparison or lookup. Do not label an H2 as sectionType=steps merely because its heading contains “1단계” or “방법”: steps means the section body itself contains a complete ordered multi-action sequence. A single stage explained with prose or a lookup table must use the role actually supported by that body. Do not repeat a body → table → body → table pattern when a list or steps communicates the same meaning more clearly. sectionType is semantic presentation intent, not a quota: never create a checklist, warning, summary, or card-like section merely for decoration. Give every paragraph a distinct information role and never split or repeat one thought. Keep each sentence readable in one breath: a Korean sentence normally stays under 20 어절 (whitespace-separated units), and this is measured — at most a quarter of the article's sentences may reach 20. A sentence that chains three clauses with -고, -며 or -이라서 is two sentences written as one, so split it instead of shortening the explanation. A table or a list presents information the section has already explained; it never carries the section by itself. Any H2 that contains a table or a list must also explain that section in prose: what the rows mean, what makes them differ, and what the reader should conclude. A section that is a table plus one or two sentences is incomplete however many rows the table has. This is measured, so write to the measurement: a section that carries a table or a list needs at least 400 characters of running prose excluding whitespace, and at least 250 when its sectionType is checklist, steps, or faq, where the list is the point and the prose exists to say why the items matter. The items themselves are not counted, so adding another bullet never satisfies it; two sentences before the list and one after will not reach 250 either. When comparison needs are supplied, at least one H2 must carry sectionType=comparison and actually contrast the named things — state the criteria, the differences, and which situation selects which — because a promised comparison that no section performs is rejected. Use a table for it when the comparison holds at least three rows of comparable data sharing the same columns, and prose when it does not. Every column must earn its place: drop a column whose value is identical in every row — it is an assumption, so state it once in the sentence above the table — and drop a column a reader can compute from another column. Measured on brightjaetech.kr 2026-08-14: an eight-column budget table carried 비정기 적립 (20만 원 in all three rows, already stated above the table), 남는 금액 (0원 in all three rows), and 소득 대비 비중 (derived from 고정지출), and the table overflowed the 800px body column on desktop. Five columns is a comfortable maximum for a blog article; declaring the comparison and then delivering neither a comparison section nor contrasting prose is the failure this rule exists to prevent. Resolve the search intent, reader problem, required information, decisions, examples, cautions, and next action, and explain each of them rather than stopping at the first sentence that addresses it. A developed article of this kind usually runs 4,500 to 6,000 characters of prose excluding whitespace, tables and list items; treat that as the shape of a complete piece rather than a quota, and never reach it by padding, by restating a point in different words, by adding material the plan does not call for, or by inventing anything. Falling below it is not a failure when the plan is genuinely exhausted. Before returning JSON, check every required element as missing, merely mentioned, or sufficiently explained, and repair only missing or insufficient information during this same response-writing process. This self-check is not a separate response or call. For health content, include causes or context, observation criteria, decision criteria, practical examples, and cautions when required by the plan, but never invent an unverified number, medical threshold, study, or diagnostic criterion.
Write polite, natural Korean as a knowledgeable person explaining the topic. Paragraphs must contain 2–4 connected sentences and should begin with varied, topic-specific wording. Do not use the stock phrases “알아보겠습니다”, “살펴보겠습니다”, “중요합니다”, “도움이 됩니다”, or “필수적입니다”. Avoid repeated one-sentence paragraphs, list-only writing, generic AI transitions, duplicated meanings, and every fabricated first-person experience (including “제가”, “저는”, and “직접 해봤습니다”). Do not force an FAQ. Prefer practical checklists only when they add information; do not replace developed prose with list-only blocks. The conclusion must summarize the reader's next action, the main decision criterion, and the most important caution in fresh wording.
Follow helpful, reliable, people-first Google Search principles and support E-E-A-T without pretending to have experience. Keyword placement is a mandatory completion contract, not a suggestion. Use the exact primary keyword naturally in the title, introduction, at least one relevant descriptive H2 or H3, the distributed body prose, the conclusion or summary, the meta description, and at least one relevant image ALT when an image is actually needed. Include every confirmed secondary keyword naturally in the section where its subject is actually explained. Distribute the primary and secondary keywords across the article instead of clustering them in one paragraph, and avoid keyword lists, awkward repetition, or stuffing. Before returning JSON, verify that no confirmed keyword is missing and that repetition still reads like natural Korean. Create a concise SEO title that starts with or naturally foregrounds the exact primary keyword, accurately represents the article, and avoids clickbait, duplicated site identity, and unnecessary filler. Write the article title as a title rather than reusing selectedTopic verbatim: the topic is a planning label and the title is what a reader sees, so they must differ in wording even though the title keeps the topic's core terms. Candidates of one planning run share a topic shape, so a title copied from the topic makes every article of that run share it too. Create a truthful 60–180-character meta description that explains what the reader will learn from the actual article without hype. Also return 5–10 concise Tistory post tags for the bottom tag field. Tags must be directly relevant, non-duplicative, not generic filler, and must not be inserted into the visible article body.
  Reader usefulness is also a mandatory completion condition, not a vague preference. Every H2 must directly fulfill its heading and declared sectionType and provide new, non-duplicative information. An explanation needs a direct answer, why it matters, and applicable conditions; a checklist needs distinct items with a reason or action; a comparison needs explicit criteria, differences, interpretation, and selection conditions; steps need ordered actions, conditions, and a usable outcome; a warning needs risk signals, exceptions, and next action; an FAQ needs complete answers; a summary may be shorter but must close the main decision; a case_example needs a concrete situation, decision, and application. One or two token sentences, heading-only sections, and repeated sentences always fail. For comparison content, a table, list, or checklist may replace some prose when it carries equal information density. Put cross-cutting advice such as recording results, checking the same conditions, avoiding self-diagnosis, or consulting a professional in the single section where it is most useful; do not repeat the same caution or next action in every H2. Before returning JSON, self-check each H2 against its sectionType guidance, confirm that it owns a distinct answer unavailable in the other sections, remove duplicated advice, and revise incomplete sections in this same response.
Safety and evidence integrity are mandatory completion conditions for every article, not optional style guidance. Never invent or imply a study, survey, statistic, percentage, probability, ranking, market volume, treatment effect, expert consensus, or causal claim unless that exact evidence and its approved source were supplied in the editorial context. Without supplied evidence, do not write phrases such as “연구에 따르면”, “통계에 따르면”, “입증되었습니다”, “대부분 효과가 있습니다”, or any precise number that presents an unsupported external fact. Never write first-person experience, product-use experience, treatment experience, or testimonial language unless the user explicitly supplied that experience as verified source material; do not write “제가”, “저는”, “직접 해보니”, “먹어봤더니”, or equivalent fabricated experience. Replace unsupported claims with accurate general explanation, observable criteria, conditional wording, or a clear statement that individual results can differ. For health content, do not diagnose, promise effects, invent treatment advice, probabilities, research, or exact statistics. Distinguish urgent warning signs when relevant, recommend professional assessment when appropriate, and do not bury the useful answer under repeated disclaimers. Before returning JSON, scan the complete manuscript and remove every unsupported evidence claim and fabricated experience. If even one remains, the article is incomplete and must not be returned.
Return no more than one source-empty representative hero image recommendation block for the entire article, and return zero when a representative image is not materially needed. A hero image must be unique to this article and must never be satisfied by reusing another post's Project image. Do not return source-empty inline or infographic image blocks. Represent comparison, checklist, summary, warning, steps, and other body visuals as a Markdown table, list, checklist, or Bright HTML/SVG component; Bright Studio may separately connect eligible body-only Project media or a user upload without a paid AI image call. The one optional image purpose must be hero, placed after the introduction with afterSection 0, and must include a specific Korean ALT plus a standalone production prompt. Decide whether CTA is useful; when useful place at most two CTA button blocks in context. Never invent a URL. If no approved CTA URL is known, use an empty targetUrl. Do not create internal, monetization, or related-post links unless their real approved URLs are supplied in the editorial context; Bright Studio will place verified catalog links separately.
Paragraph values must be plain text. When a list is needed, use newline-prefixed 1. or - items inside the paragraph string. When a table is needed, put a complete GitHub-style Markdown table in one standalone paragraph string, including a header row, a separator row such as |---|---|, and at least one data row. Never return HTML tags such as <table>, <ol>, <ul>, <li>, or <p>. Return JSON only in this exact generation shape: {"title":"...","seoTitle":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"tags":["티스토리태그1","티스토리태그2"],"introduction":["paragraph"],"sections":[{"heading":"H2 heading","sectionType":"explanation","paragraphs":["paragraph"]}],"conclusion":["paragraph"],"images":[{"afterSection":0,"purpose":"hero","alt":"specific Korean ALT","prompt":"standalone image production prompt"}],"cta":[]}. sectionType must be one of explanation, checklist, comparison, steps, warning, faq, summary, case_example. afterSection is 0 for placement after the introduction or a 1-based section number. CTA items use {"afterSection":0,"purpose":"cta","label":"...","targetUrl":"","target":"_self"}. Do not return blocks from the generation call.`,
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
    const blocks = ensureEditorialPlacement(parsedBlocks);
    const qualityTarget = input.contentOpportunity?.qualityTarget ?? determineContentPlanQualityTarget({ contentType: input.contentType });
    const metadata = typeof value.metaDescription === "string" ? { buttonCount: blocks.filter((block) => block.type === "button").length, createdAt: new Date().toISOString(), generator: "editorial-generation", imageCount: blocks.filter((block) => block.type === "image").length, language: "ko", readingTime: Math.max(1, Math.ceil(blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0) / 1000)), source: "ai", updatedAt: new Date().toISOString(), version: 1, videoCount: blocks.filter((block) => block.type === "video").length, wordCount: blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.split(/\s+/).length, 0), ...(input.contentOpportunity ? { qualityTarget } : {}), ...(typeof value.seoTitle === "string" && value.seoTitle.trim() ? { seoTitle: value.seoTitle.trim() } : {}), metaDescription: value.metaDescription.trim(), ...(typeof value.primarySearchIntent === "string" ? { primarySearchIntent: value.primarySearchIntent.trim() } : {}), ...(typeof value.secondaryIntent === "string" ? { secondaryIntent: value.secondaryIntent.trim() } : {}), ...(Array.isArray(value.secondaryKeywords) ? { secondaryKeywords: value.secondaryKeywords.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.relatedTerms) ? { relatedTerms: value.relatedTerms.filter((item): item is string => typeof item === "string") } : {}), ...(Array.isArray(value.tags) ? { tags: value.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10) } : {}) } : undefined;
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
    const normalized = new ContentNormalizer().normalize(document);
    const semantic = normalizeGeneratedSectionSemantics(normalized, qualityTarget);
    const costOptimized = applyGeneratedImageCostPolicy(semantic);
    const finalized = ensureDistinctImagePrompts(costOptimized, input.keywords[0]);
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
  const introductionBlockIds = blocks.slice(0, firstHeading).flatMap((block) => block.type === "paragraph" || block.type === "table" ? [block.id] : []);
  const lastHeading = headingIndexes.at(-1)!;
  const trailingContent = blocks.slice(lastHeading + 1).flatMap((block) => block.type === "paragraph" || block.type === "table" ? [block.id] : []);
  const conclusionBlockIds = trailingContent.length ? [trailingContent.at(-1)!] : [];
  const conclusionIds = new Set(conclusionBlockIds);
  const sections = headingIndexes.map((start, index) => {
    const heading = blocks[start];
    const end = headingIndexes[index + 1] ?? blocks.length;
    return Object.freeze({
      headingBlockId: heading.id,
      sectionType: normalizeSectionType(heading.type === "heading" ? inferSectionType(heading.text) : undefined),
      paragraphBlockIds: Object.freeze(blocks.slice(start + 1, end).flatMap((block) =>
        (block.type === "paragraph" || block.type === "table") && !conclusionIds.has(block.id) ? [block.id] : [])),
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
  seoTitle?: unknown;
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
  if (block.type === "list" && Array.isArray(block.items)) {
    const items = block.items.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (items.length) return { id, type: "list", style: block.style === "ordered" ? "ordered" : "unordered", items };
  }
  if (block.type === "table" && Array.isArray(block.headers) && Array.isArray(block.rows)) {
    const table = normalizeStructuredTable({
      caption: typeof block.caption === "string" ? block.caption : undefined,
      headers: block.headers.filter((cell): cell is string => typeof cell === "string"),
      rows: block.rows.filter((row): row is string[] => Array.isArray(row) && row.every((cell) => typeof cell === "string")),
    });
    if (table) return { ...table, id, type: "table" };
  }
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
      block.type === "paragraph" ? Boolean(block.text.trim()) : block.type === "list" ? block.items.length > 0 : block.type === "table" || block.type === "image" || block.type === "button");
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

function ensureEditorialPlacement(blocks: ContentDocument["blocks"]): ContentDocument["blocks"] {
  return blocks;
}

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
