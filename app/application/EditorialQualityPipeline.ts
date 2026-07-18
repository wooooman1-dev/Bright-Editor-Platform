import type { AIProvider } from "../../core/ai";
import { restoreProtectedImageAssets, type ContentDocument } from "../../core/content";
import { QualityEngine, type QualityReviewContext } from "../../core/quality";
import { EditorialGenerationStrategy } from "./EditorialGenerationStrategy";

const MAX_AUTOMATIC_IMPROVEMENTS = 3;

type ParseInput = Parameters<EditorialGenerationStrategy["parse"]>[1];
type QualityReport = ReturnType<QualityEngine["review"]>;

export type EditorialQualityPipelineResult = Readonly<{
  automaticImprovementCount: number;
  attemptHistory: readonly Readonly<{ accepted: boolean; phase: "final_review" | "improvement"; quality: QualityReport; rejectionReason?: string }> [];
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
      instruction: input.finalReviewInstruction(input.document, generationQuality),
      metadata: { task: "quality-final-edit" },
    });
    const finalCandidate = await this.evaluateCandidate(finalResponse.content, input.document, input.parseInput, place, input.qualityContext);
    const finalReviewQuality = finalCandidate.quality;
    const finalAccepted = !finalCandidate.rejectionReason && betterThan(finalCandidate.document, finalCandidate.quality, input.document, generationQuality);
    let currentDocument = finalAccepted ? finalCandidate.document : input.document;
    let currentQuality = finalAccepted ? finalCandidate.quality : generationQuality;
    const qualityHistory: QualityReport[] = [generationQuality, finalReviewQuality];
    const attemptHistory: Array<{ accepted: boolean; phase: "final_review" | "improvement"; quality: QualityReport; rejectionReason?: string }> = [{ accepted: finalAccepted, phase: "final_review", quality: finalReviewQuality, ...((finalCandidate.rejectionReason || !finalAccepted) ? { rejectionReason: finalCandidate.rejectionReason ?? "quality_regressed" } : {}) }];
    let best = { document: currentDocument, quality: currentQuality };
    let automaticImprovementCount = 0;

    while (!currentQuality.approved && automaticImprovementCount < MAX_AUTOMATIC_IMPROVEMENTS) {
      const response = await this.provider.generate({
        instruction: automaticImprovementInstruction(currentDocument, currentQuality, automaticImprovementCount + 1, input.requiredInformation ?? []),
        metadata: { task: "quality-auto-improvement" },
      });
      const candidate = await this.evaluateCandidate(response.content, currentDocument, input.parseInput, place, input.qualityContext);
      const accepted = !candidate.rejectionReason && betterThan(candidate.document, candidate.quality, best.document, best.quality);
      qualityHistory.push(candidate.quality);
      attemptHistory.push({ accepted, phase: "improvement", quality: candidate.quality, ...((candidate.rejectionReason || !accepted) ? { rejectionReason: candidate.rejectionReason ?? "quality_regressed" } : {}) });
      automaticImprovementCount += 1;
      if (accepted) {
        currentDocument = candidate.document;
        currentQuality = candidate.quality;
        best = { document: currentDocument, quality: currentQuality };
      }
    }

    return Object.freeze({
      automaticImprovementCount,
      attemptHistory: Object.freeze(attemptHistory),
      document: best.document,
      finalReviewQuality,
      quality: best.quality,
      qualityHistory: Object.freeze(qualityHistory),
      reachedTarget: best.quality.approved,
    });
  }

  private async evaluateCandidate(response: string, current: ContentDocument, parseInput: ParseInput, place: (document: ContentDocument) => Promise<ContentDocument>, qualityContext: QualityReviewContext): Promise<{ document: ContentDocument; quality: QualityReport; rejectionReason?: string }> {
    try {
      const parsed = restoreProtectedImageAssets(current, this.strategy.parse(response, parseInput));
      const linkError = verifiedLinkError(current, parsed);
      const safetyError = manuscriptSafetyError(current, parsed);
      const shapeError = editorialShapeError(parsed, parseInput);
      if (linkError || safetyError || shapeError) return { document: parsed, quality: this.qualityEngine.review(parsed, qualityContext), rejectionReason: linkError ?? safetyError ?? shapeError };
      const document = await place(parsed);
      return { document, quality: this.qualityEngine.review(document, qualityContext) };
    } catch (error) {
      console.error("[editorial-quality] AI revision was not a valid complete ContentDocument; preserving the current best manuscript.", { error: error instanceof Error ? error.message : "parse_failed" });
      return { document: current, quality: this.qualityEngine.review(current, qualityContext), rejectionReason: "invalid_content_document" };
    }
  }
}

function automaticImprovementInstruction(document: ContentDocument, quality: QualityReport, attempt: number, requiredInformation: readonly string[]): string {
  const diagnostics = manuscriptDiagnostics(document, requiredInformation);
  return `Automatically improve this complete Korean canonical ContentDocument. This is improvement attempt ${attempt} of ${MAX_AUTOMATIC_IMPROVEMENTS}. Rewrite the manuscript itself; never change, reinterpret, soften, or game the Quality Engine, its weights, thresholds, evidence, or approval rules.
Use the complete Rule Quality result below as the correction specification. Resolve every reported reason and actionable task with concrete changes to the relevant title, metadata, heading, paragraph, image recommendation, or approved-link placement. Do not respond with a review, plan, explanation, or vague promise to make it better.
Preserve every verified internal_link and related_post URL, label, purpose, target, and sourceExternalPostId exactly. Preserve every attached image source, assetId, sourceType, fileName, mimeType, prompt, purpose, and block ID exactly. Never invent a URL, statistic, citation, personal experience, or claim. Preserve the canonical Content Model and return the entire revised document as JSON only in the same shape accepted by the generator.
Rule Quality result: ${JSON.stringify(quality)}
Manuscript diagnostics: ${JSON.stringify(diagnostics)}
Canonical document: ${JSON.stringify(document)}`;
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
    insufficientHeadings: sections.filter((section) => section.characters < 600),
    missingRequiredInformation: requiredInformation.filter((item) => !requirementCovered(text, item)),
    repeatedOrShallowParagraphs: shallowParagraphs,
    linkState: document.blocks.flatMap((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post") ? [{ label: block.label, purpose: block.purpose, target: block.target, url: block.targetUrl }] : []),
  };
}

function betterThan(candidateDocument: ContentDocument, candidate: QualityReport, bestDocument: ContentDocument, best: QualityReport): boolean {
  if (verifiedLinkError(bestDocument, candidateDocument) || manuscriptSafetyError(bestDocument, candidateDocument)) return false;
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
function editorialShapeError(document: ContentDocument, parseInput: ParseInput): string | undefined { if (!/tistory|blog|article|long-form|장문|guide/i.test(`${parseInput.platform} ${parseInput.contentType}`)) return undefined; const characters = document.blocks.filter((block) => block.type === "paragraph").reduce((sum, block) => sum + block.text.length, 0); const h2 = document.blocks.filter((block) => block.type === "heading" && block.level === 2).length; return characters < 4500 || characters > 6000 || h2 < 5 || h2 > 8 ? "editorial_length_or_h2_out_of_range" : undefined; }
function unsafeSignals(document: ContentDocument) { const text = document.blocks.flatMap((block) => block.type === "paragraph" ? [block.text] : []).join(" "); return { experience: count(text, /(?:제가|저는|직접 해봤|경험상|사용해 보니)/g), unsupportedClaims: count(text, /(?:\d+(?:\.\d+)?\s*%|\d+\s*명 중|\d+(?:\.\d+)?\s*배|연구에 따르면)/g) }; }
function requirementCovered(text: string, requirement: string) { const terms = requirement.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term.length >= 2); return terms.length === 0 || terms.filter((term) => text.toLowerCase().includes(term)).length >= Math.max(1, Math.ceil(terms.length * 0.5)); }
function sentenceCount(value: string) { return value.split(/(?:[.!?。！？]+|습니다|합니다|됩니다|있습니다|없습니다|입니다|세요)\s*/).filter((item) => item.trim()).length; }
function count(value: string, pattern: RegExp) { return [...value.matchAll(pattern)].length; }
