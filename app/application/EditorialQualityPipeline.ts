import type { AIProvider } from "../../core/ai";
import { restoreProtectedImageAssets, type ContentDocument } from "../../core/content";
import { contentRevisionId, QualityEngine, type QualityReviewContext } from "../../core/quality";
import { EditorialGenerationStrategy } from "./EditorialGenerationStrategy";

type ParseInput = Parameters<EditorialGenerationStrategy["parse"]>[1];
type QualityReport = ReturnType<QualityEngine["review"]>;

export type EditorialQualityPipelineResult = Readonly<{
  automaticImprovementCount: 0;
  attemptHistory: readonly Readonly<{
    accepted: boolean;
    phase: "final_review";
    quality: QualityReport;
    rejectionReason?: string;
  }>[];
  document: ContentDocument;
  finalReviewQuality: QualityReport;
  quality: QualityReport;
  qualityHistory: readonly QualityReport[];
  reachedTarget: boolean;
}>;

export class EditorialQualityPipeline {
  constructor(
    private readonly provider: AIProvider,
    private readonly strategy = new EditorialGenerationStrategy(),
    private readonly qualityEngine = new QualityEngine(),
  ) {}

  async run(input: Readonly<{
    document: ContentDocument;
    finalReviewInstruction: (document: ContentDocument, quality: QualityReport) => string;
    parseInput: ParseInput;
    placeDocument?: (document: ContentDocument) => Promise<ContentDocument>;
    qualityContext: QualityReviewContext;
    requiredInformation?: readonly string[];
  }>): Promise<EditorialQualityPipelineResult> {
    const place = input.placeDocument ?? (async (document: ContentDocument) => document);
    const generationQuality = this.qualityEngine.review(input.document, input.qualityContext);
    const finalResponse = await this.provider.generate({
      instruction: singlePassFinalReviewInstruction(
        input.finalReviewInstruction(input.document, generationQuality),
        input.document,
        generationQuality,
        input.requiredInformation ?? [],
        input.parseInput.contentOpportunity,
      ),
      metadata: { task: "quality-final-edit" },
    });
    const finalCandidate = await this.evaluateCandidate(
      finalResponse.content,
      input.document,
      input.parseInput,
      place,
      input.qualityContext,
    );
    const finalReviewQuality = finalCandidate.quality;
    const accepted = !finalCandidate.rejectionReason
      && betterThan(finalCandidate.document, finalReviewQuality, input.document, generationQuality);
    const best = accepted
      ? { document: finalCandidate.document, quality: finalReviewQuality }
      : { document: input.document, quality: generationQuality };

    return Object.freeze({
      automaticImprovementCount: 0,
      attemptHistory: Object.freeze([Object.freeze({
        accepted,
        phase: "final_review" as const,
        quality: finalReviewQuality,
        ...((finalCandidate.rejectionReason || !accepted)
          ? { rejectionReason: finalCandidate.rejectionReason ?? "quality_not_improved" }
          : {}),
      })]),
      document: best.document,
      finalReviewQuality,
      quality: best.quality,
      qualityHistory: Object.freeze([generationQuality, finalReviewQuality]),
      reachedTarget: meetsApprovalTarget(best.quality),
    });
  }

  private async evaluateCandidate(
    response: string,
    current: ContentDocument,
    parseInput: ParseInput,
    place: (document: ContentDocument) => Promise<ContentDocument>,
    qualityContext: QualityReviewContext,
  ): Promise<{ document: ContentDocument; quality: QualityReport; rejectionReason?: string }> {
    try {
      const parsed = restoreProtectedImageAssets(current, this.strategy.parse(response, parseInput));
      const linkError = verifiedLinkError(current, parsed);
      const safetyError = manuscriptSafetyError(current, parsed);
      const shapeError = editorialShapeError(parsed, parseInput);
      if (linkError || safetyError || shapeError) {
        return {
          document: parsed,
          quality: this.qualityEngine.review(parsed, { ...qualityContext, revisionId: contentRevisionId(parsed) }),
          rejectionReason: linkError ?? safetyError ?? shapeError,
        };
      }
      const document = await place(parsed);
      return { document, quality: this.qualityEngine.review(document, { ...qualityContext, revisionId: contentRevisionId(document) }) };
    } catch (error) {
      console.error("[editorial-quality] AI revision was not a valid complete ContentDocument; preserving the current manuscript.", { error: error instanceof Error ? error.message : "parse_failed" });
      return { document: current, quality: this.qualityEngine.review(current, qualityContext), rejectionReason: "invalid_content_document" };
    }
  }
}

function singlePassFinalReviewInstruction(
  baseInstruction: string,
  document: ContentDocument,
  quality: QualityReport,
  requiredInformation: readonly string[],
  opportunity: ParseInput["contentOpportunity"],
): string {
  const diagnostics = manuscriptDiagnostics(document, requiredInformation);
  return `${baseInstruction}

This is the second and final AI call. Return the complete publish-ready canonical ContentDocument in this one response. Do not return a review, plan, score, explanation, or partial patch.
Mandatory server approval contract after your edit:
- overallScore >= 95
- searchIntent >= 95
- SEO >= 95
- readability >= 95
- completeness >= 95
- every other quality dimension >= 80
- usefulness >= 90
- no blocked finding and no Content Opportunity mismatch
Reader usefulness is a mandatory final-edit contract. Do not respond to a low usefulness score by merely adding sentences, rephrasing the same point, or filling length with general advice. Use the Quality report, manuscript diagnostics, required information, confirmed search intent, outline, H2 headings, and current section structure to identify which H2 fails to fulfill its own heading and editorial purpose, which H2 duplicates another section, which section lacks the concrete information appropriate to its purpose, and whether the conclusion lacks a useful next step. For every deficient section: identify the section purpose implied by the confirmed search intent, outline, and H2 heading; identify the information currently missing; add only the section-appropriate value such as a core concept, mechanism, distinguishing criterion, situation-specific difference, selection criterion, observable check, step sequence, applicability, exception, common mistake, or next action; remove or merge duplicate prose; and replace abstract encouragement with concrete explanation. Do not force methods, examples, cautions, or checklists into sections that do not need them. Every H2 must provide distinct new information, no H2 may consist only of generalities, and the conclusion must help the reader make a next decision or action rather than simply repeat the article. Preserve all already strong sections and do not damage approved keyword placement, links, images, or structure. Before returning JSON, verify for each H2: fulfillment of its heading and editorial purpose, the new information, the section-appropriate concrete value, and its distinction from every other section. If any H2 fails that check, revise it before returning the manuscript.
Evidence integrity is a mandatory final-edit contract. Do not preserve or add any unsupported research, survey, statistic, percentage, probability, ranking, market-volume, treatment-effect, expert-consensus, or causal claim unless the current canonical document or supplied editorial context contains the exact approved evidence and source. Do not preserve or add fabricated first-person experience, product-use experience, treatment experience, or testimonial language unless the user explicitly supplied it as verified source material. When the Quality report or diagnostics signals unsupportedClaimSignal, fabricatedExperienceRisk, an unsupported evidence claim, or a blocked usefulness finding, remove the offending sentence or rewrite it as accurate general guidance, observable criteria, conditional wording, or a statement that individual results may differ. Never solve this by inventing a citation, source, number, or personal story. Before returning JSON, scan the full manuscript and ensure no such claim remains; a manuscript containing even one is not complete and must not be returned.
The local scorer removes whitespace before measuring completeness. The complete body must contain at least 4,800 non-whitespace prose characters, with no maximum character limit. Organize H2 sections according to the topic and confirmed search intent, not a fixed count. Every section must fulfill its own editorial purpose with sufficient depth and developed prose. Add methods, examples, comparisons, cautions, exceptions, or alternatives only where the section and reader intent genuinely require them; do not force the same checklist into every H2. Expand every shallow or incomplete section identified by diagnostics until it fully fulfills its H2 heading and editorial purpose. Do not use list-only filler to reach the target. Keyword placement is mandatory: preserve the exact primary keyword in the title, introduction, at least one relevant heading, distributed body prose, conclusion or summary, meta description, and a relevant image ALT; place every confirmed secondary keyword naturally in the section that actually explains it. Do not cluster keywords in one paragraph, omit them, or stuff them unnaturally. Preserve all verified links and attached image assets exactly. Preserve and fulfill the immutable Content Opportunity: ${JSON.stringify(opportunity ?? null)}.
Current Rule Quality report: ${JSON.stringify(quality)}
Manuscript diagnostics: ${JSON.stringify(diagnostics)}
Required information: ${JSON.stringify(requiredInformation)}
Current canonical document: ${JSON.stringify(document)}`;
}

function manuscriptDiagnostics(document: ContentDocument, requiredInformation: readonly string[]) {
  const text = document.blocks.flatMap((block) => block.type === "paragraph" || block.type === "heading" ? [block.text] : []).join("\n");
  const sections: Array<{ heading: string; characters: number }> = [];
  let current: { heading: string; characters: number } | undefined;
  for (const block of document.blocks) {
    if (block.type === "heading" && block.level === 2) { current = { heading: block.text, characters: 0 }; sections.push(current); }
    else if (current && block.type === "paragraph") current.characters += block.text.replace(/\s/g, "").length;
  }
  const shallowParagraphs = document.blocks.flatMap((block, index) => block.type === "paragraph" && (block.text.length < 90 || sentenceCount(block.text) < 2) ? [{ blockIndex: index, characters: block.text.length, excerpt: block.text.slice(0, 100) }] : []);
  return {
    headingCharacterCounts: sections,
    insufficientHeadings: sections.filter((section) => section.characters < 300),
    missingRequiredInformation: requiredInformation.filter((item) => !requirementCovered(text, item)),
    proseCharacters: document.blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0),
    proseCharactersWithoutSpaces: document.blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0),
    paragraphCount: document.blocks.filter((block) => block.type === "paragraph").length,
    conclusionCharacters: document.blocks.filter((block) => block.type === "paragraph").at(-1)?.text.length ?? 0,
    repeatedOrShallowParagraphs: shallowParagraphs,
    linkState: document.blocks.flatMap((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post") ? [{ label: block.label, purpose: block.purpose, target: block.target, url: block.targetUrl }] : []),
  };
}

function meetsApprovalTarget(report: QualityReport): boolean {
  if (report.approved) return true;
  if (report.overallScore < 90) return false;
  if (report.findings.some((finding) => finding.severity === "error")) return false;
  if (report.dimensions.some((dimension) => dimension.status === "blocked")) return false;

  const exceptionMinimums: Partial<Record<string, number>> = {
    searchIntent: 90,
    seo: 90,
    readability: 90,
    completeness: 90,
    usefulness: 90,
  };

  return report.dimensions.every((dimension) =>
    dimension.score >= (exceptionMinimums[dimension.category] ?? 80),
  );
}

function betterThan(candidateDocument: ContentDocument, candidate: QualityReport, bestDocument: ContentDocument, best: QualityReport): boolean {
  if (verifiedLinkError(bestDocument, candidateDocument) || manuscriptSafetyError(bestDocument, candidateDocument)) return false;
  if (candidate.approved) return true;
  if (best.approved) return false;
  const candidateVector = qualityVector(candidate), bestVector = qualityVector(best);
  return candidateVector.some((value, index) => value !== bestVector[index] && value > bestVector[index] && candidateVector.slice(0, index).every((prior, priorIndex) => prior === bestVector[priorIndex]));
}
function qualityVector(report: QualityReport) {
  const selected = ["searchIntent", "seo", "readability", "structure", "completeness", "usefulness"];
  const scores = selected.map((category) => report.dimensions.find((item) => item.category === category)?.score ?? 0);
  return [report.approved ? 1 : 0, report.overallScore, Math.min(...scores), scores.reduce((sum, score) => sum + score, 0)];
}
function verifiedLinkError(current: ContentDocument, candidate: ContentDocument): string | undefined {
  const before = verifiedLinks(current), after = verifiedLinks(candidate);
  if (after.some((link) => !before.includes(link))) return "unverified_url_added";
  if (before.length !== after.length || before.some((link) => !after.includes(link))) return "verified_link_changed_or_removed";
  return undefined;
}
function verifiedLinks(document: ContentDocument) { return document.blocks.flatMap((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post") && block.targetUrl ? [`${block.purpose}|${block.label}|${block.targetUrl}|${block.target}|${block.sourceExternalPostId ?? ""}`] : []).sort(); }
function manuscriptSafetyError(current: ContentDocument, candidate: ContentDocument): string | undefined {
  const before = unsafeSignals(current), after = unsafeSignals(candidate);
  if (after.experience > before.experience) return "fabricated_experience_added";
  if (after.unsupportedClaims > before.unsupportedClaims) return "unsupported_numeric_claim_added";
  return undefined;
}
function editorialShapeError(document: ContentDocument, parseInput: ParseInput): string | undefined { if (!/tistory|blog|article|long-form|장문|guide/i.test(`${parseInput.platform} ${parseInput.contentType}`)) return undefined; const charactersWithoutSpaces = document.blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0); const h2 = document.blocks.filter((block) => block.type === "heading" && block.level === 2).length; return charactersWithoutSpaces < 4800 || h2 < 3 ? "editorial_length_or_h2_out_of_range" : undefined; }
function unsafeSignals(document: ContentDocument) { const text = document.blocks.flatMap((block) => block.type === "paragraph" ? [block.text] : []).join(" "); return { experience: count(text, /(?:제가|저는|직접 해봤|경험상|사용해 보니)/g), unsupportedClaims: count(text, /(?:\d+(?:\.\d+)?\s*%|\d+\s*명 중|\d+(?:\.\d+)?\s*배|연구에 따르면)/g) }; }
function requirementCovered(text: string, requirement: string) { const terms = requirement.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term.length >= 2); return terms.length === 0 || terms.filter((term) => text.toLowerCase().includes(term)).length >= Math.max(1, Math.ceil(terms.length * 0.5)); }
function sentenceCount(value: string) { return value.split(/(?:[.!?。！？]+|습니다|합니다|됩니다|있습니다|없습니다|입니다|세요)\s*/).filter((item) => item.trim()).length; }
function count(value: string, pattern: RegExp) { return [...value.matchAll(pattern)].length; }
