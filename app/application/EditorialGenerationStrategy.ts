import {
  analyzeLongFormDocument,
  ContentNormalizer,
  determineContentPlanQualityTarget,
  normalizeGeneratedSectionSemantics,
  normalizeContentPlanQualityTarget,
  normalizeStructuredTable,
  type BrightVisualDatum,
  type BrightVisualShape,
  type ConfirmedContentOpportunity,
  type ContentSectionType,
  type ContentDocument,
} from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";
import { applyGeneratedImageCostPolicy, ensureDistinctImagePrompts, heroVisualRegisterFromPrompt, HERO_REGISTER_LOOKBACK, HERO_VISUAL_REGISTERS } from "../../core/media";

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
    const heroVisualDirection = heroVisualDirectionFor(input.recentHeroImagePrompts ?? []);
    const quantifiableCriticalClaims = (opportunity?.verificationPlan?.claims ?? [])
      .filter((claim) => claim.risk === "critical" && QUANTIFIABLE_CRITICAL_CLAIM_KINDS.has(claim.kind));
    const workedExampleInstruction = quantifiableCriticalClaims.length
      ? ` This article has ${quantifiableCriticalClaims.length} CRITICAL Claim(s) stating a money, ratio, duration, or date fact: ${quantifiableCriticalClaims.map((claim) => claim.statement).join(" | ")}. Return workedExamples: for every one of these Claims, apply its number to one concrete reader scenario and show the computed result — a specific starting condition, the arithmetic or rule applied to it, and the concrete outcome in the reader's own terms. Stating the rule and calling it complete is not enough; the reader must see the number actually applied, not only quoted. Never invent a number beyond what the Claim already supplies. Measured 2026-09-04: an article that quoted "80퍼센트 이상 출근한 근로자에게 15일" verbatim but never applied it to a single scenario left the reader with the rule and nothing else, and was rejected for it.`
      : "";
    return {
      instruction: `Act as one integrated Korean editorial team: Content Strategist → Writer → SEO Specialist → Senior Editor → Image Strategist → Internal Link Planner → CTA Planner. For a health topic, also act as a conservative Medical Safety Reviewer. Make one editorial pass and write the complete publishable ${input.contentType} article for ${input.platform} about: ${input.keywords.join(", ")}.
Canonical Content Opportunity: ${opportunityContract}
Treat this Opportunity as one indivisible editorial contract. The selected topic, primary keyword, search intent, supporting keywords, reader problem, angle, and expected coverage must describe the same article. Do not mix in another opportunity. Putting the primary keyword mechanically into an unrelated title is not compliance: the title, H2 structure, introduction, body majority, images, internal-link context, and CTA must answer this Opportunity. Use a supporting keyword only when its subject is actually explained. Do not change a user-specified topic. Avoid excluded topics and duplicate angles supplied in the context.
  Work internally in this order without exposing the work notes: analyze search intent and reader problem; build a coverage map that assigns every planned core question and required content element to exactly one primary H2; select only the H2 sections needed to fulfill that map; assign one sectionType, reader question, and editorial purpose to each H2; write the complete article; place image recommendations and only supplied real links; decide whether a CTA is genuinely useful; then edit the whole manuscript for accuracy, flow, repetition, and natural Korean. A secondary section may refer to an earlier fact only when needed for context, but it must not re-explain that fact.
Do not return an outline, plan, writing instructions, analysis, or placeholders as article prose. Return a structured article with introduction, sections, and conclusion as separate fields. Planning information contract: ${JSON.stringify(target)}. The contentDepth is ${target.contentDepth}. Required content elements: ${target.requiredContentElements.join(" | ")}. Core questions: ${target.coreQuestions.join(" | ")}. Decision criteria: ${target.decisionCriteria.join(" | ")}. Examples needed: ${target.examplesNeeded.join(" | ")}. Warnings or exceptions: ${target.warningsOrExceptions.join(" | ")}. Actionable next steps: ${target.actionableNextSteps.join(" | ")}. Comparison needs: ${target.comparisonNeeds.join(" | ") || "none"}. Table needed: ${target.tableNeeds}. Checklist needed: ${target.checklistNeeds}. Scope boundaries are constraints on you the writer, not messages for the reader: never turn one into a sentence the article states to the reader (for example, never write that the article does not calculate or does not cover something) — silently omit that content instead. A scope boundary never overrides supplied evidence: when a fetched source passage states a value, write that value even if its topic falls within an excluded boundary phrase. Scope boundaries: ${target.scopeBoundaries.join(" | ")}. Reader problem: ${target.readerProblem}. Topic complexity: ${target.topicComplexity}. Section guidance: ${JSON.stringify(target.sectionGuidance)}. Explain every required element until the reader can understand and apply it; merely naming an element is insufficient. Choose the representation by information type: ordinary explanation stays prose; a checklist uses an unordered list; sequential action uses an ordered list; warning or summary uses a concise section with its matching sectionType; and a table is reserved for genuine multi-column comparison or lookup. Do not label an H2 as sectionType=steps merely because its heading contains “1단계” or “방법”: steps means the section body itself contains a complete ordered multi-action sequence. A single stage explained with prose or a lookup table must use the role actually supported by that body. Do not repeat a body → table → body → table pattern when a list or steps communicates the same meaning more clearly. sectionType is semantic presentation intent, not a quota: never create a checklist, warning, summary, or card-like section merely for decoration. Give every paragraph a distinct information role and never split or repeat one thought. Keep each sentence readable in one breath: a Korean sentence normally stays under 20 어절 (whitespace-separated units), and this is measured — at most a quarter of the article's sentences may reach 20. A sentence that chains three clauses with -고, -며 or -이라서 is two sentences written as one, so split it instead of shortening the explanation. A table or a list presents information the section has already explained; it never carries the section by itself. Any H2 that contains a table or a list must also explain that section in prose: what the rows mean, what makes them differ, and what the reader should conclude. A section that is a table plus one or two sentences is incomplete however many rows the table has. This is measured, so write to the measurement: a section that carries a table or a list needs at least 400 characters of running prose excluding whitespace, and at least 250 when its sectionType is checklist, steps, or faq, where the list is the point and the prose exists to say why the items matter. The items themselves are not counted, so adding another bullet never satisfies it; two sentences before the list and one after will not reach 250 either. When comparison needs are supplied, at least one H2 must carry sectionType=comparison and actually contrast the named things — state the criteria, the differences, and which situation selects which — because a promised comparison that no section performs is rejected. Use a table for it when the comparison holds at least three rows of comparable data sharing the same columns, and prose when it does not. Every column must earn its place: drop a column whose value is identical in every row — it is an assumption, so state it once in the sentence above the table — and drop a column a reader can compute from another column. Measured on brightjaetech.kr 2026-08-14: an eight-column budget table carried 비정기 적립 (20만 원 in all three rows, already stated above the table), 남는 금액 (0원 in all three rows), and 소득 대비 비중 (derived from 고정지출), and the table overflowed the 800px body column on desktop. Five columns is a comfortable maximum for a blog article; declaring the comparison and then delivering neither a comparison section nor contrasting prose is the failure this rule exists to prevent. Resolve the search intent, reader problem, required information, decisions, examples, cautions, and next action, and explain each of them rather than stopping at the first sentence that addresses it. A developed article of this kind usually runs 4,500 to 6,000 characters of prose excluding whitespace, tables and list items; treat that as the shape of a complete piece rather than a quota, and never reach it by padding, by restating a point in different words, by adding material the plan does not call for, or by inventing anything. Falling below it is not a failure when the plan is genuinely exhausted. Before returning JSON, check every required element as missing, merely mentioned, or sufficiently explained, and repair only missing or insufficient information during this same response-writing process. This self-check is not a separate response or call. For health content, include causes or context, observation criteria, decision criteria, practical examples, and cautions when required by the plan, but never invent an unverified number, medical threshold, study, or diagnostic criterion.
Answer first, qualify second. Each section states what is true - the amount, the period, the deadline, the institution, the address - in its own sentences, and only then adds the conditions under which it differs. Never send the reader away to find the answer: telling them to check the official notice, compare the current rules, or confirm the figure themselves is not an answer, and a supplied passage that states the figure must be written out rather than referred to. When a source passage names the service, the institution, the phone number, or the page a reader must open, name it in the prose; writing 공식 경로 or 공식 자료 in place of a name the Evidence supplies leaves the reader with nowhere to go. Do not stack hedges: at most one qualifier per sentence, and a paragraph whose sentences all end in ~할 수 있습니다 or ~하는 편이 좋습니다 is a paragraph that decided nothing. Write for the person in the situation, not for a reviewer: use the words a tenant, a jobseeker, or a patient would use rather than statute vocabulary such as 경위, 산정, 의사표시, 대조 when a plain word carries the same meaning. Advice to gather, record, organize, or keep documents is worth at most one section in the whole article; repeating it in every section is padding. Write polite, natural Korean as a knowledgeable person explaining the topic. Paragraphs must contain 2–4 connected sentences and should begin with varied, topic-specific wording. Do not use the stock phrases “알아보겠습니다”, “살펴보겠습니다”, “중요합니다”, “도움이 됩니다”, or “필수적입니다”. Avoid repeated one-sentence paragraphs, list-only writing, generic AI transitions, duplicated meanings, and every fabricated first-person experience (including “제가”, “저는”, and “직접 해봤습니다”). Do not force an FAQ. Prefer practical checklists only when they add information; do not replace developed prose with list-only blocks. The conclusion must summarize the reader's next action, the main decision criterion, and the most important caution in fresh wording.
Follow helpful, reliable, people-first Google Search principles and support E-E-A-T without pretending to have experience. Use the exact primary keyword in the title and in the meta description, and let it appear in the body wherever the subject is actually being discussed. Those two placements are required; the rest are not. Do not place the keyword by position — do not open successive H2 headings with it, do not lead paragraphs with it, and do not put it in an image ALT unless the picture actually shows that subject. Name the same subject with the words a reader would use, including pronouns and shorter forms, rather than repeating the full keyword phrase. Use a confirmed secondary keyword only where its subject is genuinely explained; omitting one is correct when the article does not cover it. Avoid keyword lists, awkward repetition, or stuffing. Create a concise SEO title that starts with or naturally foregrounds the exact primary keyword, accurately represents the article, and avoids clickbait, duplicated site identity, and unnecessary filler. Write the article title as a title rather than reusing selectedTopic verbatim: the topic is a planning label and the title is what a reader sees, so they must differ in wording even though the title keeps the topic's core terms. Candidates of one planning run share a topic shape, so a title copied from the topic makes every article of that run share it too. Create a truthful 60–180-character meta description that explains what the reader will learn from the actual article without hype. Also return 5–10 concise Tistory post tags for the bottom tag field. Tags must be directly relevant, non-duplicative, not generic filler, and must not be inserted into the visible article body.
  Reader usefulness is also a mandatory completion condition, not a vague preference. Every H2 must directly fulfill its heading and declared sectionType and provide new, non-duplicative information. An explanation needs a direct answer, why it matters, and applicable conditions; a checklist needs distinct items with a reason or action; a comparison needs explicit criteria, differences, interpretation, and selection conditions; steps need ordered actions, conditions, and a usable outcome; a warning needs risk signals, exceptions, and next action; an FAQ needs complete answers; a summary may be shorter but must close the main decision; a case_example needs a concrete situation, decision, and application. One or two token sentences, heading-only sections, and repeated sentences always fail. For comparison content, a table, list, or checklist may replace some prose when it carries equal information density. Put cross-cutting advice such as recording results, checking the same conditions, avoiding self-diagnosis, or consulting a professional in the single section where it is most useful; do not repeat the same caution or next action in every H2. Before returning JSON, self-check each H2 against its sectionType guidance, confirm that it owns a distinct answer unavailable in the other sections, remove duplicated advice, and revise incomplete sections in this same response.
Safety and evidence integrity are mandatory completion conditions for every article, not optional style guidance. Never invent or imply a study, survey, statistic, percentage, probability, ranking, market volume, treatment effect, expert consensus, or causal claim unless that exact evidence and its approved source were supplied in the editorial context. Without supplied evidence, do not write phrases such as “연구에 따르면”, “통계에 따르면”, “입증되었습니다”, “대부분 효과가 있습니다”, or any precise number that presents an unsupported external fact. Never write first-person experience, product-use experience, treatment experience, or testimonial language unless the user explicitly supplied that experience as verified source material; do not write “제가”, “저는”, “직접 해보니”, “먹어봤더니”, or equivalent fabricated experience. Replace unsupported claims with accurate general explanation, observable criteria, conditional wording, or a clear statement that individual results can differ. For health content, do not diagnose, promise effects, invent treatment advice, probabilities, research, or exact statistics. Distinguish urgent warning signs when relevant, recommend professional assessment when appropriate, and do not bury the useful answer under repeated disclaimers. Before returning JSON, scan the complete manuscript and remove every unsupported evidence claim and fabricated experience. If even one remains, the article is incomplete and must not be returned.
Return exactly one source-empty representative hero image recommendation block for the entire article. Every article needs a representative image, so returning zero images is not an option. A hero image must be unique to this article and must never be satisfied by reusing another post's Project image. Do not return source-empty inline image blocks; an inline picture needs a paid image and is not available here. Body visuals are different: return one to three Bright body visual blocks when a section is genuinely easier to read as a visual. They cost nothing because Bright Studio draws them as HTML cards, never as pictures, so give them no prompt. Their purpose is one of comparison, checklist, summary, warning, infographic, and their visual is one of bar, ratio, steps, timeline, compare, stat, list. Choose the shape from the material: bar compares magnitudes of the same unit, ratio splits one whole into parts, steps is an ordered procedure, timeline is dated or sequential periods, compare is two to four alternatives side by side, stat highlights up to three headline figures, list is distinct check items. Every shape except list needs data, an array of at most eight {"label":"...","value":숫자,"note":"..."}; value must be a bare number with no commas, currency, or unit, and the unit belongs in note. Send null for value in steps, timeline, and compare entries. A body visual must add a view the prose does not already give: never copy sentences that are already in the article, and never restate a table you already returned. Use a table when the reader must read exact cell values, and a body visual when the reader needs to see shape, order, or proportion. Bright Studio may separately connect eligible body-only Project media or a user upload without a paid AI image call. That one image purpose must be hero, placed after the introduction with afterSection 0, and must include a specific Korean ALT plus a standalone production prompt. ${heroVisualDirection} Every image item must always include all six fields afterSection, purpose, alt, prompt, visual, data even when one does not apply: a hero item sends visual as "" and data as []; a body visual item sends prompt as "". Decide whether CTA is useful; when useful place at most two CTA button blocks in context. Never invent a URL. If no approved CTA URL is known, use an empty targetUrl. Do not create internal, monetization, or related-post links unless their real approved URLs are supplied in the editorial context; Bright Studio will place verified catalog links separately.${workedExampleInstruction}
Paragraph values must be plain text. When a list is needed, use newline-prefixed 1. or - items inside the paragraph string. When a table is needed, put a complete GitHub-style Markdown table in one standalone paragraph string, including a header row, a separator row such as |---|---|, and at least one data row. Never return HTML tags such as <table>, <ol>, <ul>, <li>, or <p>. Return JSON only in this exact generation shape: {"title":"...","seoTitle":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"tags":["티스토리태그1","티스토리태그2"],"introduction":["paragraph"],"sections":[{"heading":"H2 heading","sectionType":"explanation","paragraphs":["paragraph"]}],"conclusion":["paragraph"],"images":[{"afterSection":0,"purpose":"hero","alt":"specific Korean ALT","prompt":"standalone image production prompt","visual":"","data":[]},{"afterSection":2,"purpose":"comparison","alt":"카드 제목이 되는 한국어 한 줄","prompt":"","visual":"bar","data":[{"label":"단독가구","value":2200,"note":"만 원"}]}],"cta":[],"workedExamples":[{"afterSection":1,"scenario":"입사 10개월 차에 결근 없이 근무한 근로자라면","computation":"매월 개근할 때마다 1일씩 발생해 10개월 동안 10일이 쌓입니다","result":"이 경우 총 10일의 연차휴가를 받을 수 있습니다"}]}. sectionType must be one of explanation, checklist, comparison, steps, warning, faq, summary, case_example. afterSection is 0 for placement after the introduction or a 1-based section number. CTA items use {"afterSection":0,"purpose":"cta","label":"...","targetUrl":"","target":"_self"}. workedExamples items use {"afterSection":N,"scenario":"...","computation":"...","result":"..."} and, when no CRITICAL money/ratio/duration/date Claim exists, an empty array is correct. Do not return blocks from the generation call.`,
    };
  }

  parse(response: string, input: GenerationInput): ContentDocument {
    const value = unwrapDocument(JSON.parse(stripFence(response))) as GenerationDocument;
    if (typeof value.title !== "string") throw new Error("AI response is not a valid Content Model.");
    if (input.structuredLongFormOutput && !isStructuredGenerationDocument(value)) {
      throw new Error("AI response did not use the required structured long-form generation contract.");
    }
    const structured = isStructuredGenerationDocument(value);
    if (structured) assertWorkedExamplesForQuantifiableClaims(value, input);
    const converted = structured ? structuredBlocks(value) : undefined;
    if (!converted && !Array.isArray(value.blocks)) throw new Error("AI response is not a valid Content Model.");
    const parsedBlocks = converted?.blocks ?? normalizeLongFormHeadings(value.blocks!.map((block, index) => parseBlock(block, index)), input);
    if (!structured) assertCompleteArticle(parsedBlocks);
    const blocks = ensureEditorialPlacement(parsedBlocks, value.title.trim(), input.keywords[0]);
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
    const finalized = ensureDistinctImagePrompts(costOptimized, input.keywords[0], input.recentHeroImagePrompts ?? []);
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
  workedExamples?: unknown;
  blocks?: unknown[];
};

type StructuredGenerationDocument = GenerationDocument & {
  title: string;
  introduction: string[];
  sections: Array<{ heading: string; sectionType?: ContentSectionType; paragraphs: string[] }>;
  conclusion: string[];
};

// 대표 이미지의 시각 계열을 모델에게도 알려준다.
// 코드가 프롬프트를 다시 쓰는 경로(ensureDistinctImagePrompts)만으로는 부족하다.
// 2026-08-28 실측 기준 대표 이미지 프롬프트 57개 중 37개는 모델이 직접 쓴 것이었고,
// 시각 지침이 없어 전부 같은 스톡 사진 장면으로 수렴했다.
function heroVisualDirectionFor(recentHeroImagePrompts: readonly string[]): string {
  const registers = HERO_VISUAL_REGISTERS.map((register) => `${register.label}(${register.action})`).join(" / ");
  const used = [...new Set(recentHeroImagePrompts
    .slice(0, HERO_REGISTER_LOOKBACK)
    .map((prompt) => heroVisualRegisterFromPrompt(prompt))
    .filter((value): value is NonNullable<typeof value> => Boolean(value)))]
    .map((id) => HERO_VISUAL_REGISTERS.find((register) => register.id === id)?.label ?? id);
  const avoid = used.length
    ? ` The recent articles of this blog already used these registers: ${used.join(", ")}. Do not repeat them; pick a register that is not in that list.`
    : "";
  return `Choose the hero image's visual register deliberately instead of defaulting to a stock scene. The registers are: ${registers}. Measured on brightjaetech.kr 2026-08-28: across 57 hero images every prompt used 상황 사진, so articles on unrelated subjects all rendered as the same photograph — a middle-aged person at a desk checking documents with a calculator and a smartphone. Use 상황 사진 only when a person's action is genuinely the subject of the article; when the subject is a rule, a threshold, an order of steps, or a comparison, 사물 정물, 평면 개념 그래픽, or 관계 도식 explains it better and keeps the blog's list page from looking like one repeated picture.${avoid} The image must contain no readable letters or numbers anywhere — not on documents, screens, notes, signs, or tables — because generated text is frequently wrong and a hero image cannot carry a wrong figure.`;
}

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
  const imageValues = normalizeImagePlacements(Array.isArray(value.images) ? value.images : [], value.sections.length);
  const ctaValues = Array.isArray(value.cta) ? value.cta : [];
  const exampleValues = Array.isArray(value.workedExamples) ? value.workedExamples : [];
  appendPlacementBlocks(blocks, imageValues, ctaValues, exampleValues, 0);
  const sections = value.sections.map((section, sectionIndex) => {
    const headingBlockId = `section-${sectionIndex + 1}-heading`;
    blocks.push({ id: headingBlockId, type: "heading", level: 2, text: section.heading });
    const paragraphBlockIds = section.paragraphs.map((text, paragraphIndex) => {
      const id = `section-${sectionIndex + 1}-paragraph-${paragraphIndex + 1}`;
      blocks.push({ id, type: "paragraph", text });
      return id;
    });
    appendPlacementBlocks(blocks, imageValues, ctaValues, exampleValues, sectionIndex + 1);
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
  examples: unknown[],
  afterSection: number,
): void {
  for (const [index, item] of [...images, ...ctas, ...examples].entries()) {
    if (!item || typeof item !== "object" || Number((item as { afterSection?: unknown }).afterSection) !== afterSection) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.result === "string" && typeof record.scenario === "string") {
      const text = [record.scenario, record.computation, record.result]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(" ").trim();
      if (text) blocks.push({ id: `worked-example-${blocks.length + index}`, type: "paragraph", text });
    } else if (typeof record.alt === "string") {
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
  if (block.type === "image" && typeof block.alt === "string") return { alt: block.alt, id, source: typeof block.source === "string" ? block.source : "", type: "image", ...(typeof block.prompt === "string" ? { prompt: block.prompt.trim() } : {}), ...(normalizeImagePurpose(block.purpose) ? { purpose: normalizeImagePurpose(block.purpose) } : {}), ...(typeof block.assetId === "string" && block.assetId.trim() ? { assetId: block.assetId.trim() } : {}), ...(typeof block.fileName === "string" && block.fileName.trim() ? { fileName: block.fileName.trim() } : {}), ...(typeof block.mimeType === "string" && block.mimeType.trim() ? { mimeType: block.mimeType.trim() } : {}), ...(normalizeImageSourceType(block.sourceType) ? { sourceType: normalizeImageSourceType(block.sourceType) } : {}), ...(normalizeVisualShape(block.visual) ? { visual: normalizeVisualShape(block.visual) } : {}), ...(normalizeVisualData(block.data).length ? { data: normalizeVisualData(block.data) } : {}), ...(typeof block.caption === "string" && block.caption.trim() ? { caption: block.caption.trim() } : {}) };
  if (block.type === "button" && typeof block.label === "string" && typeof block.targetUrl === "string") return { id, label: block.label, purpose: normalizePurpose(block.purpose), target: block.target === "_blank" ? "_blank" : "_self", targetUrl: block.targetUrl, ...(typeof block.sourceExternalPostId === "string" && block.sourceExternalPostId.trim() ? { sourceExternalPostId: block.sourceExternalPostId.trim() } : {}), type: "button" };
  throw new Error(`AI returned unsupported block ${index + 1}.`);
}

const QUANTIFIABLE_CRITICAL_CLAIM_KINDS = new Set(["money", "ratio", "duration", "date", "dateRange"]);

/**
 * 법 조문이나 기준율을 정확히 인용한다고 해서 독자가 자기 상황에 대입할
 * 방법을 아는 건 아니다. 2026-09-04 실측: 연차휴가 원고가 "80% 이상 출근시
 * 15일" 규정을 조문까지 정확히 인용했지만, 그 규정을 실제 숫자에 대입한
 * 계산 예시가 하나도 없어 독자가 얻는 건 규정 문구뿐이었다. CRITICAL 이고
 * 금액·비율·기간·날짜 종류인 Claim이 하나라도 있으면, 그 값을 실제로 대입한
 * workedExamples 없이는 원고를 반환할 수 없게 막는다 — 부탁이 아니라 거부다.
 */
function assertWorkedExamplesForQuantifiableClaims(value: GenerationDocument, input: GenerationInput): void {
  const claims = input.contentOpportunity?.verificationPlan?.claims ?? [];
  const requiresExample = claims.some((claim) => claim.risk === "critical" && QUANTIFIABLE_CRITICAL_CLAIM_KINDS.has(claim.kind));
  if (!requiresExample) return;
  const examples = Array.isArray(value.workedExamples) ? value.workedExamples : [];
  const hasExample = examples.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return typeof record.result === "string" && record.result.trim().length > 0
      && typeof record.scenario === "string" && record.scenario.trim().length > 0;
  });
  if (!hasExample) {
    throw new Error("AI response omitted a worked example for a critical money/ratio/duration/date Claim.");
  }
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

// 대표 이미지는 생성 응답에 의존하지 않는다.
// 2026-08-28 근로장려금 원고(content-mtcqjahd-oesz46)는 이미지 블록 0개로 저장돼
// 대표 이미지 생성 화면 자체가 뜨지 않았고, 그대로 초안 발행까지 갔다.
// 모델이 images를 비워 보내든 afterSection을 범위 밖으로 보내든 hero 한 장은 항상 남는다.
function ensureEditorialPlacement(blocks: ContentDocument["blocks"], title: string, primaryKeyword: string | undefined): ContentDocument["blocks"] {
  // 대표 이미지가 있는지만 본다. 본문 무료 시각물은 이제 남지만(2026-08-29) 그것은
  // 대표 이미지를 대신하지 못한다 — 본문 카드만 있는 응답을 통과시키면 대표 이미지가
  // 0장으로 끝나고, 그러면 생성 화면 자체가 뜨지 않는다(D-048).
  //
  // purpose 가 비어 있는 이미지도 대표 이미지로 친다. 2026-09-04 실측
  // (content-mroi39eu-cc1fqo): 수동으로 추가하거나 옛 방식으로 저장된 이미지
  // 블록은 purpose 가 없는데, 이걸 hero 로 안 쳐주면 AI 개선안 같은 재파싱 경로를
  // 지날 때마다 합성 대표 이미지가 하나씩 더 끼어들어 이미지가 계속 늘어난다.
  // purpose 가 명시적으로 다른 값(inline·comparison 등)이면 여전히 hero 로 안 친다.
  if (blocks.some((block) => block.type === "image" && (block.purpose === "hero" || !block.purpose))) return blocks;
  const subject = (primaryKeyword ?? "").trim() || title;
  if (!subject) return blocks;
  // 도입부 문단 바로 뒤, 첫 제목이나 CTA보다 앞에 놓는다.
  const afterIntroduction = blocks.findIndex((block) => block.type !== "paragraph");
  const placed = [...blocks];
  // 제작 프롬프트는 넣지 않는다. ensureDistinctImagePrompts가 배치된 섹션 맥락으로 채운다.
  placed.splice(afterIntroduction < 0 ? placed.length : afterIntroduction, 0, {
    alt: `${subject} 핵심 내용을 요약한 대표 이미지`,
    id: "hero-image",
    purpose: "hero",
    source: "",
    type: "image",
  });
  return placed;
}

// 모델이 준 afterSection을 실제 배치 지점으로 맞춘다.
// appendPlacementBlocks는 일치하는 지점이 없으면 이미지를 조용히 버리므로,
// hero는 도입부 뒤(0)로 고정하고 나머지는 존재하는 섹션 범위로 자른다.
function normalizeImagePlacements(images: unknown[], sectionCount: number): unknown[] {
  return images.map((item) => {
    if (!item || typeof item !== "object") return item;
    const record = item as Record<string, unknown>;
    if (typeof record.alt !== "string") return item;
    const requested = Number(record.afterSection);
    const placement = record.purpose === "hero" || !Number.isFinite(requested)
      ? 0
      : Math.min(Math.max(Math.trunc(requested), 0), sectionCount);
    return { ...record, afterSection: placement };
  });
}

function normalizeLevel(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 { return typeof value === "number" && value >= 1 && value <= 6 ? value as 1 | 2 | 3 | 4 | 5 | 6 : 2; }
function normalizePurpose(value: unknown): "cta" | "internal_link" | "monetization" | "related_post" { return value === "internal_link" || value === "monetization" || value === "related_post" ? value : "cta"; }
function normalizeImagePurpose(value: unknown): "hero" | "comparison" | "checklist" | "infographic" | "summary" | "warning" | "inline" | undefined { return value === "hero" || value === "comparison" || value === "checklist" || value === "infographic" || value === "summary" || value === "warning" || value === "inline" ? value : undefined; }
function normalizeVisualShape(value: unknown): BrightVisualShape | undefined {
  return value === "list" || value === "bar" || value === "ratio" || value === "steps"
    || value === "timeline" || value === "compare" || value === "stat" ? value : undefined;
}
/**
 * 값은 숫자만 받는다. 모델이 "2,200만 원" 같은 문자열을 보내면 길이를 그릴 수
 * 없으므로 값 없이 라벨만 남긴다 — 그리다 깨지는 것보다 낫다.
 */
function normalizeVisualData(value: unknown): readonly BrightVisualDatum[] {
  if (!Array.isArray(value)) return [];
  const items = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) return [];
    const note = typeof record.note === "string" ? record.note.trim() : "";
    const raw = record.value;
    const numeric = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
    return [Object.freeze({
      label,
      ...(note ? { note } : {}),
      ...(numeric === undefined ? {} : { value: numeric }),
    })];
  });
  return Object.freeze(items.slice(0, 8));
}
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
