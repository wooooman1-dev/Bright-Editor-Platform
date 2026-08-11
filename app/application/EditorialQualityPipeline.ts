import {
  appendAIUsageToDocument,
  hasGeneratedFactualClaimInventoryResponse,
  parseGeneratedFactualClaimInventoryDrafts,
  type AIResponse,
  type AIProvider,
} from "../../core/ai";
import { activeGeneratedFactualClaims, guardQualityReviewFactualClaims, isApprovalPolicyProfileId, resolveApprovalPolicySnapshot, type ApprovalPolicySnapshot } from "../../core/approval";
import { analyzeLongFormDocument, normalizeContentPlanQualityTarget, restoreProtectedImageAssets, restoreVerifiedEditorialLinks, type ContentDocument, type ContentPlanQualityTarget } from "../../core/content";
import { editorialRevisionId, evaluateQualityReviewReadiness, QualityEngine, type QualityReviewContext } from "../../core/quality";
import { contentOpportunityAIContext, EditorialGenerationStrategy } from "./EditorialGenerationStrategy";
import { preserveCanonicalSeoMetadata } from "./SeoMetadataPolicy";

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
  providerDiagnostics?: import("../../core/ai").AIResponse["diagnostics"];
  reachedTarget: boolean;
}>;

export function contentDocumentAIContext(document: ContentDocument): Readonly<Record<string, unknown>> {
  if (!document.metadata) return document;
  const excluded = new Set(["qualityTarget", "generationDiagnostic", "reviewDiagnostic", "aiUsage", "generatedClaimVerification", "generatedFactualClaimInventory"]);
  const metadataEntries = Object.fromEntries(
    Object.entries(document.metadata).filter(([key]) => !excluded.has(key)),
  );
  const approvalPolicy = publicApprovalPolicyContext(document.metadata.approvalPolicy);
  const metadata = Object.freeze({
    ...metadataEntries,
    ...(approvalPolicy ? { approvalPolicy } : {}),
  });
  return Object.freeze({
    ...document,
    metadata,
  });
}

function publicApprovalPolicyContext(
  stored: ApprovalPolicySnapshot | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (!stored) return undefined;
  const current = isApprovalPolicyProfileId(stored.profileId)
    ? resolveApprovalPolicySnapshot(stored.contentPurpose, stored.profileId)
    : undefined;
  const publicSnapshot = { ...(current ?? stored) } as Record<string, unknown>;
  Reflect.deleteProperty(publicSnapshot, "profileId");
  return Object.freeze(publicSnapshot);
}

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
      metadata: {
        task: "quality-final-edit",
        ...(input.document.metadata?.generatedFactualClaimInventory
          ? { factualInventoryMode: "structured_claims_v2" }
          : {}),
      },
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
    const document = appendAIUsageToDocument(best.document, finalResponse.diagnostics?.aiUsage);

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
      document,
      finalReviewQuality,
      quality: best.quality,
      qualityHistory: Object.freeze([generationQuality, finalReviewQuality]),
      ...(finalResponse.diagnostics || finalCandidate.rejectionReason === "invalid_content_document"
        ? { providerDiagnostics: qualityReviewDiagnostics(finalResponse.diagnostics, finalCandidate.rejectionReason) }
        : {}),
      reachedTarget: meetsStandardApprovalTarget(document, best.quality),
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
      const parsed = preserveReviewMetadata(current, restoreVerifiedEditorialLinks(
        current,
        restoreProtectedImageAssets(current, this.strategy.parse(response, parseInput)),
      ));
      const factualGuard = current.metadata?.generatedFactualClaimInventory
        ? hasGeneratedFactualClaimInventoryResponse(response)
          ? guardQualityReviewFactualClaims({
              current,
              candidate: parsed,
              drafts: parseGeneratedFactualClaimInventoryDrafts(response),
            })
          : { passed: false as const, document: parsed, reason: "quality_factual_inventory_response_missing" }
        : { passed: true as const, document: parsed };
      if (!factualGuard.passed) {
        const quality = this.qualityEngine.review(parsed, contextForDocument(qualityContext, parsed));
        return { document: parsed, quality, rejectionReason: factualGuard.reason };
      }
      const guarded = factualGuard.document;
      const parsedQuality = this.qualityEngine.review(guarded, contextForDocument(qualityContext, guarded));
      const parsedDiagnostic = analyzeLongFormDocument(guarded, parseInput.contentOpportunity?.qualityTarget ?? guarded.metadata?.qualityTarget);
      const readiness = evaluateQualityReviewReadiness(guarded, parsedQuality, parsedDiagnostic);
      const linkError = verifiedLinkError(current, guarded);
      const safetyError = manuscriptSafetyError(current, guarded);
      const shapeError = editorialShapeError(guarded, parseInput) ?? (readiness.fatal ? readiness.fatalReasons[0] : undefined);
      if (linkError || safetyError || shapeError) {
        return { document: guarded, quality: parsedQuality, rejectionReason: linkError ?? safetyError ?? shapeError };
      }
      const document = await place(guarded);
      const quality = this.qualityEngine.review(document, contextForDocument(qualityContext, document));
      const placedDiagnostic = analyzeLongFormDocument(document, parseInput.contentOpportunity?.qualityTarget ?? document.metadata?.qualityTarget);
      const placedReadiness = evaluateQualityReviewReadiness(document, quality, placedDiagnostic);
      return placedReadiness.fatal
        ? { document, quality, rejectionReason: placedReadiness.fatalReasons[0] }
        : { document, quality };
    } catch (error) {
      console.error("[editorial-quality] AI revision was not a valid complete ContentDocument; preserving the current manuscript.", { error: error instanceof Error ? error.message : "parse_failed" });
      return { document: current, quality: this.qualityEngine.review(current, qualityContext), rejectionReason: "invalid_content_document" };
    }
  }
}

function qualityReviewDiagnostics(
  diagnostics: AIResponse["diagnostics"],
  rejectionReason?: string,
): NonNullable<AIResponse["diagnostics"]> {
  return Object.freeze({
    ...(diagnostics ?? {}),
    stage: "quality_review" as const,
    ...(rejectionReason === "invalid_content_document"
      ? { completionStatus: "parse_error" as const }
      : { completionStatus: diagnostics?.completionStatus ?? "completed" as const }),
  });
}

function singlePassFinalReviewInstruction(
  baseInstruction: string,
  document: ContentDocument,
  quality: QualityReport,
  requiredInformation: readonly string[],
  opportunity: ParseInput["contentOpportunity"],
): string {
  const opportunityContext = opportunity ? contentOpportunityAIContext(opportunity) : undefined;
  const target = normalizeContentPlanQualityTarget(
    opportunityContext?.qualityTarget ?? document.metadata?.qualityTarget,
    { contentType: "article" },
  );
  const diagnostics = manuscriptDiagnostics(document, requiredInformation, target);
  const priorities = qualityPriorities(quality);
  const protectedClaims = protectedGeneratedFactualClaims(document);
  return `${baseInstruction}

This is the second and final AI call. Make only targeted editorial corrections to the current canonical document. Do not broadly rewrite strong sections or expand the manuscript into a new long-form draft. Return the complete publish-ready canonical ContentDocument in this one response. Do not return a review, plan, score, explanation, or partial patch. Every paragraph.text must be plain text; represent ordered or unordered lists with newline-prefixed \`1.\` or \`-\` items and never return HTML list or paragraph tags.
Mandatory server approval contract after your edit:
- standard approval only; exception approval is not publish-ready
- overallScore >= 95
- searchIntent >= 95
- SEO >= 95
- readability >= 95
- completeness >= 95
- every other scored quality dimension >= 80
- usefulness >= 90
- no blocked finding and no Content Opportunity mismatch
- preserve contentDepth ${target.contentDepth} and the same Planning information contract: ${JSON.stringify(target)}
- preserve every current H2 and its editorial role unless removing a demonstrably duplicate section
- preserve every required content element: ${target.requiredContentElements.join(" | ")}
- repeated core advice = 0
  Work from the explicit priority list below. Correct blocked and below-threshold dimensions first, using their reasons, tasks, and evidence. Do not rewrite or expand a dimension that already meets its threshold unless a priority correction requires a small consistency edit. Judge every required element as missing, merely mentioned, or sufficiently explained. Only sufficient information counts as complete. Add only a small missing fact, criterion, example, caution, or next action when needed. Remove repetition and verbose explanation. When repeatedCoreAdviceCount is nonzero, keep the strongest occurrence in its owning H2 and delete or replace later repetitions with genuinely new section-specific information. When practicalToolSignals are insufficient, convert existing generic advice into a usable checklist, ordered decision path, comparison criteria, or worked application instead of appending general prose. A comparison may use a table, criteria, and lists instead of prose when that is clearer. When two candidates have equal quality, prefer the more concise result. Stop editing when the search intent and reader problem are fully resolved. This is not another AI call.
Presentation semantics must remain useful and restrained. Preserve ordinary prose when it is sufficient. Use an unordered list for a real checklist, an ordered list for sequential actions, and a table only for genuine multi-column comparison or lookup; do not turn steps or reminders into tables and do not add decorative card-like sections. Preserve the current longFormStructure sectionType ownership so the deterministic renderer can distinguish checklist, warning, summary, comparison, steps, and standard content without changing factual text.
Reader usefulness is a mandatory final-edit contract. Do not respond to a low usefulness score by merely adding sentences, rephrasing the same point, or filling length with general advice. Use the Quality report, manuscript diagnostics, required information, confirmed search intent, outline, H2 headings, and current section structure to identify which H2 fails to fulfill its own heading and editorial purpose, which H2 duplicates another section, which section lacks the concrete information appropriate to its purpose, and whether the conclusion lacks a useful next step. For every deficient section: identify the section purpose implied by the confirmed search intent, outline, and H2 heading; identify the information currently missing; add only the section-appropriate value such as a core concept, mechanism, distinguishing criterion, situation-specific difference, selection criterion, observable check, step sequence, applicability, exception, common mistake, or next action; remove or merge duplicate prose; and replace abstract encouragement with concrete explanation. Do not force methods, examples, cautions, or checklists into sections that do not need them. Every H2 must provide distinct new information, no H2 may consist only of generalities, and the conclusion must help the reader make a next decision or action rather than simply repeat the article. Preserve all already strong sections and do not damage approved keyword placement, links, images, or structure. Before returning JSON, verify for each H2: fulfillment of its heading and editorial purpose, the new information, the section-appropriate concrete value, and its distinction from every other section. If any H2 fails that check, revise it before returning the manuscript.
Evidence integrity is a mandatory final-edit contract. Do not preserve or add any unsupported research, survey, statistic, percentage, probability, ranking, market-volume, treatment-effect, expert-consensus, or causal claim unless the current canonical document or supplied editorial context contains the exact approved evidence and source. Do not preserve or add fabricated first-person experience, product-use experience, treatment experience, or testimonial language unless the user explicitly supplied it as verified source material. When the Quality report or diagnostics signals unsupportedClaimSignal, fabricatedExperienceRisk, an unsupported evidence claim, or a blocked usefulness finding, remove the offending sentence or rewrite it as accurate general guidance, observable criteria, conditional wording, or a statement that individual results may differ. Never solve this by inventing a citation, source, number, or personal story. Before returning JSON, scan the full manuscript and ensure no such claim remains; a manuscript containing even one is not complete and must not be returned.
Verified factual surfaces are protected server-owned facts. For every item in Protected verified factual surfaces below, preserve surfaceText verbatim in the same factual meaning. Do not change its amount, rate, comparator, basis, date, period, subject, scope, eligibility condition, location, legal proposition, or temporal meaning. If surrounding prose needs improvement, edit around the protected surface instead of paraphrasing or replacing it. Do not add new factual variants of the same Claim. The server will revalidate the current manuscript against these canonical Claim IDs after this response.
Protected verified factual surfaces: ${JSON.stringify(protectedClaims)}
  ${document.metadata?.generatedFactualClaimInventory ? "Return the complete current factual inventory as top-level verificationClaimsUsed. It must contain every protected factual surface exactly once with the same claimId, origin, risk, statement, surfaceText, Evidence URL/excerpt, semantic JSON, qualifiers, and temporal requirement. Do not use origin=quality_review and do not add a new factual item. If a correction would require a new fact, keep the existing supported wording or use NONE advice instead. The server rejects this candidate if the inventory is missing, changed, incomplete, or contains a new Claim." : "Do not add new externally verifiable facts during this edit."}
  Preserve the exact primary keyword naturally in the article title, SEO title, introduction, a relevant heading, distributed body prose, conclusion or summary, meta description, and a relevant image ALT; preserve every confirmed secondary keyword in the section that explains it. Preserve all verified links, tags, related posts, attached image assets and prompts, and longFormStructure metadata. Never create a URL that is not already verified and supplied. Preserve and fulfill the immutable Content Opportunity: ${JSON.stringify(opportunityContext ?? null)}.
  Current Rule Quality report: ${JSON.stringify(quality)}
  Priority corrections: ${JSON.stringify(priorities)}
  Manuscript diagnostics: ${JSON.stringify(diagnostics)}
Required information: ${JSON.stringify(requiredInformation)}
  Current canonical document: ${JSON.stringify(contentDocumentAIContext(document))}`;
}

function qualityPriorities(quality: QualityReport) {
  const minimums: Readonly<Record<string, number>> = {
    searchIntent: 95,
    seo: 95,
    readability: 95,
    completeness: 95,
    usefulness: 90,
  };
  const dimensions = quality.dimensions
    .filter((dimension) => dimension.status === "blocked" || dimension.score < (minimums[dimension.category] ?? 80))
    .map((dimension) => ({
      category: dimension.category,
      score: dimension.score,
      requiredScore: minimums[dimension.category] ?? 80,
      status: dimension.status,
      reasons: dimension.reasons,
      evidence: dimension.evidence,
    }));
  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    tasks: Object.freeze(quality.tasks),
  });
}

function protectedGeneratedFactualClaims(document: ContentDocument) {
  const inventory = activeGeneratedFactualClaims(document.metadata?.generatedFactualClaimInventory);
  if (document.metadata?.generatedFactualClaimInventory) return Object.freeze(inventory.map((claim) => Object.freeze({
    claimId: claim.claimId,
    planningClaimId: claim.planningClaimId ?? "",
    origin: claim.origin,
    risk: claim.risk,
    surfaceText: claim.surfaceText,
    statement: claim.statement,
    kind: claim.kind,
    normalizedValueJson: claim.normalizedValueJson,
    qualifiers: {
      subject: claim.qualifiers.subject ?? "",
      scope: claim.qualifiers.scope ?? "",
      basis: claim.qualifiers.basis ?? "",
      note: claim.qualifiers.note ?? "",
    },
    temporalRequirementJson: claim.temporalRequirement ? JSON.stringify(claim.temporalRequirement) : "null",
    evidenceUrl: claim.evidenceUrl ?? "",
    evidenceExcerpt: claim.evidenceExcerpt ?? "",
  })));
  const stored = document.metadata?.generatedClaimVerification;
  if (stored?.semanticContractVersion !== 1 || !stored.semanticClaims?.length) return Object.freeze([]);
  return Object.freeze(stored.semanticClaims.map((claim) => Object.freeze({
    claimId: claim.claimId,
    surfaceText: claim.surfaceText,
    kind: claim.kind,
    normalizedValue: claim.normalizedValue,
    qualifiers: claim.qualifiers,
    temporalRequirement: claim.temporalRequirement ?? null,
  })));
}

function manuscriptDiagnostics(document: ContentDocument, requiredInformation: readonly string[], target: ContentPlanQualityTarget) {
  const text = document.blocks.flatMap((block) => block.type === "paragraph" || block.type === "heading" ? [block.text] : []).join("\n");
  const longForm = analyzeLongFormDocument(document, target);
  const sections = longForm.sections.map((section) => ({
    heading: section.heading,
    sectionType: section.sectionType,
    completeness: section.completeness,
    informationElementCount: section.informationElementCount,
    listItemCount: section.listItemCount,
    tableCount: section.tableCount,
  }));
  return {
    sections,
    incompleteSections: longForm.violations.filter((item) => item.code === "CONTENT_INCOMPLETE_SECTION"),
    requiredContentElements: longForm.requiredContentElements,
    repetitionWarnings: longForm.repetitionWarnings,
    missingRequiredInformation: requiredInformation.filter((item) => !requirementCovered(text, item)),
    paragraphCount: document.blocks.filter((block) => block.type === "paragraph").length,
    linkState: document.blocks.flatMap((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post") ? [{ label: block.label, purpose: block.purpose, target: block.target, url: block.targetUrl }] : []),
  };
}

function meetsStandardApprovalTarget(document: ContentDocument, report: QualityReport): boolean {
  if (!report.approved || report.approvalType !== "standard") return false;
  if (document.metadata?.qualityTarget) {
    const diagnostic = analyzeLongFormDocument(document, document.metadata.qualityTarget);
    if (diagnostic.violations.length) return false;
  }
  if (report.overallScore < 95) return false;
  if (report.findings.some((finding) => finding.severity === "error")) return false;
  if (report.dimensions.some((dimension) => dimension.status === "blocked")) return false;
  const editorialMinimums: Partial<Record<string, number>> = {
    searchIntent: 95,
    seo: 95,
    readability: 95,
    completeness: 95,
    usefulness: 90,
  };
  return report.dimensions.every((dimension) =>
    dimension.score >= (editorialMinimums[dimension.category] ?? 80),
  );
}

function betterThan(candidateDocument: ContentDocument, candidate: QualityReport, bestDocument: ContentDocument, best: QualityReport): boolean {
  if (verifiedLinkError(bestDocument, candidateDocument) || manuscriptSafetyError(bestDocument, candidateDocument) || detectEditorialReviewRegression(bestDocument, candidateDocument)) return false;
  const candidateStandard = candidate.approved && candidate.approvalType === "standard";
  const bestStandard = best.approved && best.approvalType === "standard";
  if (candidateStandard && !bestStandard) return true;
  if (bestStandard && !candidateStandard) return false;
  if (candidate.approved && !best.approved) return true;
  if (best.approved && !candidate.approved) return false;
  const candidateVector = qualityVector(candidate), bestVector = qualityVector(best);
  const improved = candidateVector.some((value, index) => value !== bestVector[index] && value > bestVector[index] && candidateVector.slice(0, index).every((prior, priorIndex) => prior === bestVector[priorIndex]));
  if (improved) return true;
  return candidateVector.every((value, index) => value === bestVector[index])
    && proseTelemetry(candidateDocument) < proseTelemetry(bestDocument);
}

function qualityVector(report: QualityReport) {
  const selected = ["searchIntent", "seo", "readability", "structure", "completeness", "usefulness"];
  const scores = selected.map((category) => report.dimensions.find((item) => item.category === category)?.score ?? 0);
  return [report.approvalType === "standard" ? 1 : 0, report.overallScore, Math.min(...scores), scores.reduce((sum, score) => sum + score, 0)];
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
function editorialShapeError(document: ContentDocument, parseInput: ParseInput): string | undefined {
  if (!/tistory|blog|article|long-form|장문|guide/i.test(`${parseInput.platform} ${parseInput.contentType}`)) return undefined;
  const paragraphs = document.blocks.filter((block) => block.type === "paragraph" && block.text.trim());
  const h2 = document.blocks.filter((block) => block.type === "heading" && block.level === 2).length;
  return paragraphs.length === 0 || h2 === 0 ? "editorial_shape_incomplete" : undefined;
}
function unsafeSignals(document: ContentDocument) { const text = document.blocks.flatMap((block) => block.type === "paragraph" ? [block.text] : []).join(" "); return { experience: count(text, /(?:제가|저는|직접 해봤|경험상|사용해 보니)/g), unsupportedClaims: count(text, /(?:\d+(?:\.\d+)?\s*%|\d+\s*명 중|\d+(?:\.\d+)?\s*배|연구에 따르면)/g) }; }
function requirementCovered(text: string, requirement: string) { const terms = requirement.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term.length >= 2); return terms.length === 0 || terms.filter((term) => text.toLowerCase().includes(term)).length >= Math.max(1, Math.ceil(terms.length * 0.5)); }
function count(value: string, pattern: RegExp) { return [...value.matchAll(pattern)].length; }

function preserveReviewMetadata(current: ContentDocument, candidate: ContentDocument): ContentDocument {
  const protectedCandidate = preserveCanonicalSeoMetadata(current, candidate);
  const baseMetadata = protectedCandidate.metadata ?? current.metadata;
  if (!baseMetadata) return protectedCandidate;
  const metadata = {
    ...baseMetadata,
    qualityTarget: current.metadata?.qualityTarget ?? protectedCandidate.metadata?.qualityTarget,
    longFormStructure: preserveSectionTypeOwnership(
      current.metadata?.longFormStructure,
      protectedCandidate.metadata?.longFormStructure,
    ),
    ...(protectedCandidate.metadata?.tags?.length ? { tags: protectedCandidate.metadata.tags } : current.metadata?.tags?.length ? { tags: current.metadata.tags } : {}),
    ...(current.metadata?.approvalEvidence ? { approvalEvidence: current.metadata.approvalEvidence } : {}),
    ...(current.metadata?.generatedClaimVerification ? { generatedClaimVerification: current.metadata.generatedClaimVerification } : {}),
    ...(current.metadata?.generatedFactualClaimInventory ? { generatedFactualClaimInventory: current.metadata.generatedFactualClaimInventory } : {}),
    ...(current.metadata?.aiUsage ? { aiUsage: current.metadata.aiUsage } : {}),
    generationDiagnostic: current.metadata?.generationDiagnostic,
  };
  const diagnostic = analyzeLongFormDocument({ ...protectedCandidate, metadata }, metadata.qualityTarget);
  return Object.freeze({ ...protectedCandidate, metadata: Object.freeze({ ...metadata, reviewDiagnostic: diagnostic }) });
}

function preserveSectionTypeOwnership(
  current: NonNullable<ContentDocument["metadata"]>["longFormStructure"],
  candidate: NonNullable<ContentDocument["metadata"]>["longFormStructure"],
): NonNullable<ContentDocument["metadata"]>["longFormStructure"] {
  if (!candidate) return current;
  if (!current) return candidate;
  return Object.freeze({
    ...candidate,
    sections: Object.freeze(candidate.sections.map((section, index) => Object.freeze({
      ...section,
      sectionType: current.sections[index]?.sectionType ?? section.sectionType,
    }))),
  });
}

/**
 * The review context is built once, from the document as generated, but the
 * pipeline re-places catalog links on the document it goes on to review.
 * Carrying the original status forward reported a missing publishing category
 * on an article whose internal link and related posts had already been placed,
 * so the finding contradicted the manuscript it described.
 */
function contextForDocument(
  context: QualityReviewContext,
  document: ContentDocument,
): QualityReviewContext {
  const status = document.metadata?.internalLinkCatalogStatus;
  return {
    ...context,
    revisionId: editorialRevisionId(document),
    ...(status ? { internalLinkCatalogStatus: status } : {}),
  };
}

export function detectEditorialReviewRegression(current: ContentDocument, candidate: ContentDocument): string | undefined {
  const target = current.metadata?.qualityTarget ?? candidate.metadata?.qualityTarget;
  const before = analyzeLongFormDocument(current, target);
  const after = analyzeLongFormDocument(candidate, target);
  const beforeHeadings = before.sections.map((item) => item.heading.trim());
  const afterHeadings = after.sections.map((item) => item.heading.trim());
  if (JSON.stringify(beforeHeadings) !== JSON.stringify(afterHeadings)) return "h2_structure_changed";
  if (!target) return undefined;
  if (before.requiredContentElements.some((item) => item.satisfied && !after.requiredContentElements.find((next) => next.element === item.element)?.satisfied)) return "required_content_element_removed";
  if (before.sections.some((item, index) =>
    item.completeness === "sufficient" && after.sections[index]?.completeness !== "sufficient")) {
    return "section_completeness_regressed";
  }
  const beforeInformation = before.sections.reduce((sum, item) => sum + item.informationElementCount, 0);
  const afterInformation = after.sections.reduce((sum, item) => sum + item.informationElementCount, 0);
  if (afterInformation < beforeInformation * 0.7) return "information_elements_regressed";
  return undefined;
}

function proseTelemetry(document: ContentDocument): number {
  return document.blocks.reduce((sum, block) => block.type === "paragraph" ? sum + block.text.replace(/\s/g, "").length : sum, 0);
}
