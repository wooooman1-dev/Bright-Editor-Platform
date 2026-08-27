import {
  approvalPolicySnapshotFromEditorialContext,
  calculationDisclosureContract,
  canonicalizeApprovalEvidenceUrl,
  applyGeneratedFactualClaimInventory,
  createGeneratedClaimVerificationRecord,
  evaluateStoredGeneratedFactualClaims,
  validateGeneratedFactualClaimDrafts,
  type ApprovalEvidenceFact,
  type ApprovalEvidenceSource,
  type ApprovalPolicySnapshot,
  type GeneratedClaimBinding,
  type GeneratedFactualClaim,
  type SiteApprovalReadinessFetch,
  type VerificationGenerationGateResult,
  type VerificationGenerationPlan,
  type VerificationSnapshot,
} from "../approval";
import type { ApprovalSourcePreflightCoverageResult } from "../approval/ApprovalSourcePreflightCoverage";
import {
  findUnrequestedOwnedIdentityOccurrences,
  findUnrequestedOwnedIdentityPrefixes,
  longFormNarrativeFloors,
  serializeStructuredList,
  type ConfirmedContentOpportunity,
  type ContentDocument,
} from "../content";
import { editorialRevisionId } from "../quality/QualityEngine";
import { AIProviderError, type AIProvider, type AIResponse, type AIWebSource } from "./AIProvider";
import {
  runApprovalSourcePreflight,
  withApprovalSourcePreflightInstruction,
  type ApprovalSourcePreflightClaimSource,
} from "./ApprovalSourcePreflight";
import { appendAIUsageToDocument } from "./AIUsageCost";
import {
  hasGeneratedFactualClaimInventoryResponse,
  parseGeneratedFactualClaimInventoryDrafts,
  parseGeneratedFactualClaimDrafts,
  withGeneratedFactualClaimResponseInstruction,
} from "./GeneratedFactualClaimResponse";
import { evaluateGeneratedFactualClaimDecisions } from "./GeneratedVerifyEvidence";
import {
  requireApprovalGenerationEvidence,
  requireExplicitVerificationGenerationBundle,
} from "./VerificationGenerationBundle";
import { isCriticalVerificationClaim } from "../approval/VerificationClaim";

export type PlatformId = string & { readonly __platformId: unique symbol };
export type ContentTypeId = string & { readonly __contentTypeId: unique symbol };

export type GenerationInput = Readonly<{
  contentId?: string;
  contentType: ContentTypeId;
  contentOpportunity?: ConfirmedContentOpportunity;
  editorialContext?: string;
  keywords: readonly string[];
  platform: PlatformId;
  projectId: string;
  structuredLongFormOutput?: boolean;
}>;

export type GenerationResult = Readonly<{
  document: ContentDocument;
  rawResponse: string;
  generatedClaimBindings?: readonly GeneratedClaimBinding[];
  verificationSnapshot?: VerificationSnapshot;
  providerDiagnostics?: AIResponse["diagnostics"];
  sourcePreflightDiagnostics?: AIResponse["diagnostics"];
}>;

export interface ContentGenerationStrategy {
  createRequest(input: GenerationInput): Readonly<{ instruction: string }>;
  parse(response: string, input: GenerationInput): ContentDocument;
}

export type AIWorkflowStatus =
  | "idle"
  | "generating"
  | "generated"
  | "failed";

export type AIWorkflowState = Readonly<{
  error?: string;
  result?: GenerationResult;
  status: AIWorkflowStatus;
}>;

export class AIWorkflow {
  private state: AIWorkflowState = Object.freeze({ status: "idle" });

  constructor(
    private readonly provider: AIProvider,
    private readonly strategy: ContentGenerationStrategy,
    private readonly options: Readonly<{ verifyEvidenceFetcher?: SiteApprovalReadinessFetch }> = {},
  ) {}

  getState(): AIWorkflowState {
    return this.state;
  }

  async generate(input: GenerationInput): Promise<GenerationResult> {
    validateInput(input);
    assertOwnedIdentityKeywordPolicy(input);
    this.state = Object.freeze({ status: "generating" });
    try {
      const approvalSnapshot = approvalPolicySnapshotFromEditorialContext(
        input.editorialContext,
      );
      const sourcePreflight = approvalSnapshot
        && input.structuredLongFormOutput
        && input.contentOpportunity
        ? await runApprovalSourcePreflight({
            provider: this.provider,
            snapshot: approvalSnapshot,
            opportunity: input.contentOpportunity,
            platform: input.platform,
            contentType: input.contentType,
          })
        : undefined;
      const generationPreflight = sourcePreflight
        && input.contentOpportunity?.verificationPlan?.claims.some(isCriticalVerificationClaim)
        ? requireExplicitVerificationGenerationBundle({
            plan: input.contentOpportunity.verificationPlan,
            snapshot: sourcePreflight.verificationSnapshot,
            sources: sourcePreflight.sources,
            claimSources: sourcePreflight.claimSources,
            coverage: sourcePreflight.coverage,
            sourcePolicyCompliance: sourcePreflight.sourcePolicyCompliance,
          })
        : sourcePreflight;
      if (sourcePreflight) {
        requireApprovalGenerationEvidence({
          preflight: sourcePreflight,
          contract: input.contentOpportunity?.requiredEvidenceContract,
        });
      }
      const factualInventoryGeneration = Boolean(
        approvalSnapshot && input.structuredLongFormOutput && input.contentOpportunity,
      );
      const request = this.strategy.createRequest(input);
      const canonicalInstruction = withCanonicalEditorialContext(
        request.instruction,
        input.editorialContext,
      );
      const preflightInstruction = generationPreflight
        ? withApprovalSourcePreflightInstruction(
            canonicalInstruction,
            generationPreflight.sources,
            generationPreflight.claimSources,
          )
        : withApprovalEvidenceSearchInstruction(
            canonicalInstruction,
            approvalSnapshot,
          );
      const riskInstruction = withVerificationClaimRiskInstruction(factualInventoryGeneration
        ? withWithdrawableFactIsolationInstruction(
            withGeneratedFactualClaimResponseInstruction(preflightInstruction),
          )
        : preflightInstruction, input.contentOpportunity);
      const instruction = approvalSnapshot
        ? withCalculationExampleDisclosureContract(
            `${riskInstruction}\n\n${approvalInformationDateContract()}`,
          )
        : riskInstruction;
      const response = await this.provider.generate({
        ...request,
        instruction,
        metadata: {
          contentType: input.contentType,
          platform: input.platform,
          ...(input.structuredLongFormOutput
            ? { task: "content-generation" }
            : {}),
          ...(factualInventoryGeneration
            ? { verificationGenerationMode: "structured_claims_v2" }
            : {}),
          ...(input.contentOpportunity?.qualityTarget
            ? {
                qualityTarget: JSON.stringify(
                  input.contentOpportunity.qualityTarget,
                ),
              }
            : {}),
          ...(approvalSnapshot
            ? {
                approvalPurpose: approvalSnapshot.contentPurpose,
                approvalProfileId: approvalSnapshot.profileId,
                approvalPolicyVersion: approvalSnapshot.policyVersion,
                approvalEvidenceMode: generationPreflight?.sources.length
                  ? "preflight_verified"
                  : "verify_best_effort",
              }
            : {}),
        },
      });
      let parsedDocument: ContentDocument;
      try {
        parsedDocument = this.strategy.parse(response.content, input);
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        throw AIProviderError.parse({
          stage: "generation",
          message: error instanceof Error ? error.message : "Generation response could not be parsed.",
          diagnostic: response.diagnostics,
        });
      }
      const policyDocument = withApprovalPolicyMetadata(
        parsedDocument,
        input.editorialContext,
      );
      const evidenceDocument = withApprovalEvidenceMetadata(
        policyDocument,
        input.editorialContext,
        [
          ...(generationPreflight?.sources ?? []),
          ...(response.diagnostics?.webSources ?? []),
          ...generatedDocumentCitationSources(policyDocument),
        ],
        undefined,
        generationPreflight?.claimSources,
        generationPreflight?.coverage,
        generationPreflight?.sourcePolicyCompliance,
      );
      const preflightUsageDocument = appendAIUsageToDocument(
        evidenceDocument,
        sourcePreflight?.diagnostics?.aiUsage,
      );
      const generatedDocument = appendAIUsageToDocument(
        preflightUsageDocument,
        response.diagnostics?.aiUsage,
      );
      assertGeneratedDocumentOwnedIdentityPolicy(generatedDocument, input);

      const inventoryDrafts = factualInventoryGeneration
        ? parseGeneratedFactualClaimInventoryDrafts(response.content)
        : Object.freeze([]);
      if (factualInventoryGeneration && !hasGeneratedFactualClaimInventoryResponse(response.content)) {
        throw new Error("Generation response is missing the factual Claim inventory.");
      }

      let semanticClaims: readonly GeneratedFactualClaim[] | undefined;
      let semanticContract: Readonly<{
        plan: VerificationGenerationPlan;
        snapshot: VerificationSnapshot;
        gate: VerificationGenerationGateResult;
      }> | undefined;
      if (
        generationPreflight
        && "gate" in generationPreflight
        && input.contentOpportunity?.verificationPlan?.claims.some(isCriticalVerificationClaim)
        && sourcePreflight?.verificationSnapshot
      ) {
        semanticContract = Object.freeze({
          plan: input.contentOpportunity.verificationPlan,
          snapshot: sourcePreflight.verificationSnapshot,
          gate: generationPreflight.gate,
        });
        const semanticValidation = validateGeneratedFactualClaimDrafts({
          document: generatedDocument,
          plan: input.contentOpportunity.verificationPlan,
          snapshot: sourcePreflight.verificationSnapshot,
          gate: generationPreflight.gate,
          drafts: parseGeneratedFactualClaimDrafts(response.content).filter((draft) =>
            input.contentOpportunity!.verificationPlan!.claims.some((claim) =>
              isCriticalVerificationClaim(claim) && claim.claimId === draft.claimId,
            )),
        });
        /**
         * 완성된 원고를 사후 판정으로 버리지 않는다 (D-045).
         *
         * 이 검사는 생성이 쓴 값이 Preflight 스냅샷의 값과 같은지 본다. 그
         * 스냅샷을 `verified` 로 만들던 의미 검증과 커버리지를 걷어낸 이상
         * 비교할 기준이 없고, 무엇보다 여기서 던지면 원고를 다 만든 뒤에
         * 버리는 것이다 — 토큰은 이미 쓰였고 사용자는 빈손이 된다.
         */
        semanticClaims = semanticValidation.claims;
      }

      const inventoryApplied = factualInventoryGeneration && approvalSnapshot && input.contentOpportunity
        ? applyGeneratedFactualClaimInventory({
            document: generatedDocument,
            drafts: inventoryDrafts,
            decisions: await evaluateGeneratedFactualClaimDecisions({
              drafts: inventoryDrafts,
              opportunity: input.contentOpportunity,
              snapshot: approvalSnapshot,
              webSources: response.diagnostics?.webSources ?? [],
              verifiedCriticalClaimIds: generationPreflight && "gate" in generationPreflight
                ? generationPreflight.gate.verifiedClaimIds
                : [],
              ...(this.options.verifyEvidenceFetcher ? { fetcher: this.options.verifyEvidenceFetcher } : {}),
            }),
            fallbackTitle: input.contentOpportunity.selectedTopic,
            ...(semanticClaims
              ? { protectedSurfaceTexts: semanticClaims.map((claim) => claim.surfaceText) }
              : {}),
          }).document
        : generatedDocument;

      /**
       * The factual inventory is the last stage that edits the canonical
       * document, so the semantic Claim projection computed above describes the
       * pre-inventory manuscript. Persisting it unchanged let one revision carry
       * two Claim structures that disagreed about whether a Claim survived, and
       * left stale block locations behind when the inventory dropped a block.
       * Rebinding against the final document is what keeps them one answer.
       */
      if (semanticClaims && semanticContract && inventoryApplied !== generatedDocument) {
        const rebound = evaluateStoredGeneratedFactualClaims({
          document: inventoryApplied,
          plan: semanticContract.plan,
          snapshot: semanticContract.snapshot,
          gate: semanticContract.gate,
          claims: semanticClaims,
        });
        // 같은 이유로 인벤토리 적용 뒤에도 던지지 않는다 (D-045).
        semanticClaims = rebound.claims;
      }

      const generatedClaimVerification = generationPreflight
        && "gate" in generationPreflight
        && input.contentOpportunity?.verificationPlan?.claims.some(isCriticalVerificationClaim)
        && sourcePreflight?.verificationSnapshot
        ? createGeneratedClaimVerificationRecord({
            document: inventoryApplied,
            plan: input.contentOpportunity.verificationPlan,
            snapshot: sourcePreflight.verificationSnapshot,
            boundEditorialRevisionId: editorialRevisionId(inventoryApplied),
            semanticClaims,
          })
        : undefined;
      const canonicalGeneratedDocument = generatedClaimVerification
        ? Object.freeze({
              ...inventoryApplied,
              metadata: Object.freeze({
              ...inventoryApplied.metadata!,
              generatedClaimVerification,
            }),
          })
        : inventoryApplied;
      const result = Object.freeze({
        document: canonicalGeneratedDocument,
        rawResponse: response.content,
        ...(generatedClaimVerification
          ? { generatedClaimBindings: generatedClaimVerification.bindings }
          : {}),
        ...(sourcePreflight?.verificationSnapshot
          ? { verificationSnapshot: sourcePreflight.verificationSnapshot }
          : {}),
        ...(response.diagnostics
          ? { providerDiagnostics: response.diagnostics }
          : {}),
        ...(sourcePreflight?.diagnostics
          ? { sourcePreflightDiagnostics: sourcePreflight.diagnostics }
          : {}),
      });
      this.state = Object.freeze({ result, status: "generated" });
      return result;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "AI generation failed.";
      this.state = Object.freeze({ error: message, status: "failed" });
      throw error;
    }
  }
}

/**
 * The factual inventory is the last stage that edits the canonical manuscript,
 * and it withdraws an unverified factual surface by deleting the whole
 * paragraph that carries it. Measured on content-msrfq4gt-fc8ub1: the writer
 * cleared every prose floor as generated (411, 497, 499, 414, 416 and 498
 * characters), the sweep then deleted four paragraphs whose only fault was a
 * 정보 기준일 date or a 법령 reference the inventory had not reported, and two
 * sections dropped to 221 and 345 against floors of 250 and 400. One of the
 * deleted paragraphs was the prose that explained the comparison table.
 *
 * The writer cannot make the server verify a fact, but it decides which
 * sentence sits in which paragraph. Keeping a withdrawable fact out of the
 * paragraph that explains a section is what makes a withdrawal cost the article
 * the fact instead of the explanation.
 *
 * This applies only where the factual inventory runs — approval preparation —
 * so revenue content keeps writing facts wherever they read best.
 */
function withWithdrawableFactIsolationInstruction(instruction: string): string {
  return `${instruction}\n\nWithdrawal-resilient paragraph contract (mandatory): the server checks every factual surface and deletes the entire paragraph carrying a factual surface it cannot verify, so write so that a deletion costs the article the fact and never the explanation. Keep each externally verifiable fact — an amount, a rate or percentage, a date belonging to the subject matter such as a statute enforcement date or an application deadline, a statute or article reference, an eligibility, application, or contract condition — in its own short paragraph that states that fact with its source context and nothing else. Never place such a sentence in the same paragraph as the prose that explains a section's table or list, its reasoning, or the reader's next action. Every H2 must still fulfil its role and reach its running-prose minimum — ${longFormNarrativeFloors.standard} characters excluding whitespace, or ${longFormNarrativeFloors.listShaped} when its sectionType is ${longFormNarrativeFloors.listShapedSectionTypes.join(", ")} — counting only the paragraphs that carry no verifiable fact, because a section whose explanation is welded to a withdrawable fact loses both at once. Report every factual surface you write in the factual Claim inventory: an unreported factual sentence is deleted from the manuscript without replacement.`;
}

/**
 * 날짜는 시스템이 쓴다 (D-043).
 *
 * 예전 계약은 본문 끝에 "정보 기준과 다시 확인할 곳" 섹션을 만들어 정보 기준일과
 * 공식 재확인 경로를 쓰게 했다. 그 두 가지를 시스템이 출처 영역에 이미 렌더링하고
 * 있어 같은 값이 한 화면에 두 번 나왔다. 게다가 요구한 두 문단은 113자인데 모든
 * H2에 400자 산문을 요구하므로, 남는 자리를 결론 재탕이 채웠다.
 *
 * Approval preparation only: revenue content has no date contract.
 */
export function approvalInformationDateContract(): string {
  return `Date-ownership contract (mandatory for approval preparation): never write a date that describes this article's own currency or review. Never write 정보 기준일, 출처 확인일, 최종 검토일 or any equivalent label, in any section, in any form. Bright Studio renders those dates itself beneath the verified source list after Evidence verification, so writing them yourself produces the same date twice on one page. Do not create a closing section that points the reader at an official page to re-check the article — the verified source links carry that, and the system renders them. Naming an institution inside ordinary explanation stays allowed; what is prohibited is a date line and a separate re-check section. Dates that belong to the subject matter — a statute's enforcement date, an application deadline, a period a rule covers — are unaffected and stay in the article as factual Claims.`;
}

/**
 * Ask for the whole disclosure, because half of one earns nothing.
 *
 * An article that computes an example carries figures no institution
 * publishes, so its source is the assumptions printed beside it. The
 * classifier grants that exemption only when the section says all three
 * things, and a live generation stopped after the second: `대출원금 1억원, 연
 * 4.8%, 3년, 매월 납부라는 동일한 가정을 둔 계산 예시입니다`. Every amount in
 * its comparison table was then recorded as an unsourced external claim —
 * eleven of them — for want of a clause saying the figures do not stand for a
 * real charge.
 *
 * The clauses come from `calculationDisclosureContract`, which the classifier
 * enforces, so the instruction cannot drift away from what actually exempts.
 */
export function withCalculationExampleDisclosureContract(instruction: string): string {
  return `${instruction}\n\nCalculation-example contract (mandatory for approval preparation): when a section presents figures you computed from assumptions rather than figures an institution publishes — a comparison table of payment amounts, a worked total, an illustrative balance — that same section must carry one prose sentence stating all three of: ${calculationDisclosureContract.clauses.join("; ")}. Naming the assumptions alone is not enough and neither is the word 예시. Write it as prose in the section that holds the figures, not as a footnote elsewhere, because the exemption is scoped to the section. Model sentence: "${calculationDisclosureContract.example}" Do not attach this disclosure to figures that came from a verified Claim value; those are published facts and this contract does not apply to them.`;
}

function withVerificationClaimRiskInstruction(
  instruction: string,
  opportunity: ConfirmedContentOpportunity | undefined,
): string {
  const verifyClaims = opportunity?.verificationPlan?.claims.filter((claim) =>
    !isCriticalVerificationClaim(claim) && claim.risk === "verify") ?? [];
  if (!verifyClaims.length) return instruction;
  return `${instruction}\n\nVerification risk rule: the following VERIFY Claims are optional and have no mandatory Evidence bundle: ${JSON.stringify(verifyClaims.map((claim) => ({ claimId: claim.claimId, statement: claim.statement, rawValue: claim.rawValue })))}. Do not state an unsupported concrete VERIFY value as fact. When it cannot be supported by the available Evidence, remove it. Do not replace a removed fact with general advice: writing that the reader should check the official notice, compare the current rules, or organize the documents is not a substitute for the fact, and an article made of such sentences answers nothing. A shorter article that states what the Evidence supports is correct; filling the space a removed fact left is not. NONE Claims are editorial guidance and require no source.`;
}

export function withCanonicalEditorialContext(
  instruction: string,
  editorialContext?: string,
): string {
  const context = editorialContext?.trim();
  if (!context || instruction.includes(context)) return instruction;
  return `${instruction}\n\nCanonical server editorial context (mandatory; do not ignore or override):\n${context}`;
}

export function withApprovalPolicyMetadata(
  document: ContentDocument,
  editorialContext?: string,
): ContentDocument {
  const snapshot = approvalPolicySnapshotFromEditorialContext(editorialContext);
  if (!snapshot) return document;
  if (!document.metadata) {
    throw new Error(
      "Approval preparation generation requires canonical document metadata.",
    );
  }
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata,
      approvalPolicy: snapshot,
    }),
  });
}

export function withApprovalEvidenceMetadata(
  document: ContentDocument,
  editorialContext: string | undefined,
  webSources: readonly AIWebSource[],
  retrievedAt = new Date().toISOString(),
  claimSources: readonly ApprovalSourcePreflightClaimSource[] = [],
  coverage?: ApprovalSourcePreflightCoverageResult,
  sourcePolicyCompliance?: "passed" | "failed" | "not_required",
): ContentDocument {
  const snapshot = approvalPolicySnapshotFromEditorialContext(editorialContext);
  if (!snapshot || !webSources.length) return document;
  if (!document.metadata) {
    throw new Error(
      "Approval preparation generation requires canonical document metadata.",
    );
  }

  const candidates = approvalEvidenceCandidates(
    webSources,
    snapshot,
    retrievedAt,
    claimSources,
    sourcePolicyCompliance,
  );
  if (!candidates.length) return document;
  const preflightVerified = sourcePolicyCompliance === "passed"
    && coverage?.status === "covered"
    && candidates.some((source) => source.provenance === "system_verified" && source.verified);
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata,
      approvalEvidence: Object.freeze({
        version: "1.0" as const,
        status: preflightVerified ? "verified" as const : "needs_review" as const,
        ...(preflightVerified ? { reviewedAt: retrievedAt } : {}),
        ...(coverage ? {
          coverageStatus: coverage.status === "covered"
            ? "verified" as const
            : coverage.status === "incomplete"
              ? "needs_review" as const
              : "missing" as const,
          requiredFactFields: Object.freeze(coverage.requiredClaims.map((claim) => claim.field)),
          verifiedFactFields: Object.freeze([...coverage.coveredClaimFields]),
          unverifiedFactFields: Object.freeze([...coverage.uncoveredClaimFields]),
        } : {}),
        ...(sourcePolicyCompliance ? { sourcePolicyCompliance } : {}),
        sources: candidates,
      }),
    }),
  });
}

export function assertOwnedIdentityKeywordPolicy(
  input: GenerationInput,
): void {
  const opportunity = input.contentOpportunity;
  if (!opportunity) return;
  const ownedTerms = editorialOwnedIdentityTerms(input.editorialContext);
  if (!ownedTerms.length) return;
  const contamination = findUnrequestedOwnedIdentityPrefixes({
    ownedTerms,
    sourceRequest: opportunity.sourceRequest,
    selectionMode: opportunity.selectionMode,
    values: [
      opportunity.selectedTopic,
      opportunity.primaryKeyword,
      ...opportunity.secondaryKeywords,
      ...input.keywords,
    ],
  });
  if (!contamination.length) return;
  throw new Error(
    `저장된 콘텐츠 기획에 검색 주제가 아닌 프로젝트명 또는 브랜드명이 포함되어 AI 생성을 차단했습니다: ${contamination.join(", ")}. 새 Content에서 Planning을 다시 실행해 주세요.`,
  );
}

export function assertGeneratedDocumentOwnedIdentityPolicy(
  document: ContentDocument,
  input: GenerationInput,
): void {
  const opportunity = input.contentOpportunity;
  if (!opportunity) return;
  const ownedTerms = editorialOwnedIdentityTerms(input.editorialContext);
  if (!ownedTerms.length) return;
  const contamination = findUnrequestedOwnedIdentityOccurrences({
    ownedTerms,
    sourceRequest: opportunity.sourceRequest,
    selectionMode: opportunity.selectionMode,
    values: generatedEditorialValues(document),
  });
  if (!contamination.length) return;
  throw new Error(
    `AI 생성 결과의 제목·본문·메타데이터·이미지 설명 또는 태그에 요청하지 않은 프로젝트명 또는 브랜드명이 포함되어 결과 저장을 차단했습니다: ${contamination.join(", ")}.`,
  );
}

function generatedEditorialValues(
  document: ContentDocument,
): readonly string[] {
  const metadata = document.metadata;
  return Object.freeze([
    document.title,
    metadata?.seoTitle ?? "",
    metadata?.metaDescription ?? "",
    metadata?.primarySearchIntent ?? "",
    metadata?.secondaryIntent ?? "",
    ...(metadata?.secondaryKeywords ?? []),
    ...(metadata?.relatedTerms ?? []),
    ...(metadata?.tags ?? []),
    ...document.blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") {
        return [block.text];
      }
      if (block.type === "list") return [serializeStructuredList(block)];
      if (block.type === "table") {
        return [
          block.caption ?? "",
          ...block.headers,
          ...block.rows.flat(),
        ];
      }
      if (block.type === "image") {
        return [block.alt, block.prompt ?? "", block.caption ?? ""];
      }
      if (block.type === "button") return [block.label];
      return [];
    }),
  ].filter(Boolean));
}

/**
 * Preserve URLs that the model actually printed in the generated document.
 * Provider web-search diagnostics are not guaranteed to include every URL the
 * model selected in its prose, so relying on diagnostics alone can associate a
 * document with an unrelated search result. These candidates remain ordinary
 * citations and are verified by the shared Evidence Fetch/Claim matcher.
 */
export function generatedDocumentCitationSources(
  document: ContentDocument,
): readonly AIWebSource[] {
  const urls = new Set<string>();
  for (const value of generatedEditorialValues(document)) {
    for (const match of value.matchAll(/https:\/\/[^\s<>'"\])}]+/gi)) {
      const url = match[0].replace(/[.,;:!?]+$/g, "");
      if (url) urls.add(url);
    }
  }
  return Object.freeze([...urls].map((url) => Object.freeze({
    url,
    provenance: "citation" as const,
  })));
}

function approvalEvidenceCandidates(
  webSources: readonly AIWebSource[],
  snapshot: ApprovalPolicySnapshot,
  retrievedAt: string,
  claimSources: readonly ApprovalSourcePreflightClaimSource[],
  sourcePolicyCompliance?: "passed" | "failed" | "not_required",
): readonly ApprovalEvidenceSource[] {
  const claimsByUrl = new Map(claimSources.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source.claims,
  ]));
  const preflightVerifiedUrls = new Set(
    sourcePolicyCompliance === "passed"
      ? claimSources.map((source) => canonicalizeApprovalEvidenceUrl(source.url))
      : [],
  );
  const candidates = new Map<string, ApprovalEvidenceSource>();
  for (const source of webSources) {
    const url = canonicalizeApprovalEvidenceUrl(source.url);
    if (!url.startsWith("https://") || candidates.has(url)) continue;
    const publisher = sourcePublisher(url);
    const preflightVerified = preflightVerifiedUrls.has(url);
    const provenance = preflightVerified
      ? "system_verified" as const
      : source.provenance === "citation"
      ? "citation"
      : "search_candidate" as const;
    const verifiedClaims = claimsByUrl.get(url) ?? [];
    const claimFacts: readonly ApprovalEvidenceFact[] = Object.freeze(
      verifiedClaims.map((claim) => Object.freeze({
        field: claim.field,
        value: claim.value,
        excerpt: claim.evidenceExcerpt,
      })),
    );
    candidates.set(url, Object.freeze({
      sourceId: approvalSourceId(url),
      url,
      originalUrl: source.url,
      canonicalUrl: url,
      title: source.title?.trim() || publisher,
      publisher,
      sourceType: snapshot.profileId === "tistory_vivarain_art_v1"
        ? "official_archive"
        : "official_institution",
      retrievedAt,
      verified: preflightVerified,
      provenance,
      ...(source.excerpt ? { citationExcerpt: source.excerpt } : {}),
      facts: claimFacts.length
        ? claimFacts
        : Object.freeze(
            provenance === "citation" && source.excerpt
              ? [Object.freeze({
                  field: "citedContext",
                  value: source.excerpt,
                })]
              : [],
          ),
      ...(preflightVerified ? {
        official: true,
        verificationStatus: "verified" as const,
        accessVerificationStatus: "verified" as const,
        officialDomainVerificationStatus: "verified" as const,
        claimVerificationStatus: "verified" as const,
        checkedAt: retrievedAt,
      } : {}),
      cited: source.provenance === "citation",
      selected: preflightVerified || provenance === "citation",
    }));
  }
  return Object.freeze([...candidates.values()]);
}

function approvalSourceId(url: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `approval-source-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourcePublisher(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "공식 출처 후보";
  }
}

function withApprovalEvidenceSearchInstruction(
  instruction: string,
  snapshot: ApprovalPolicySnapshot | undefined,
): string {
  if (!snapshot) return instruction;
  return `${instruction}\n\nApproval evidence search contract (mandatory):
- Use the attached web search tool during this same Generation call.
- Prefer official primary sources required by the active profile. Use a direct official detail or guidance page that contains the cited fact; search-result, listing, archive-index, and navigation pages are not accepted as final Evidence.
- Do not use a secondary blog, copied article, community post, or search-result snippet when an official institution page is available.
- Use only facts supported by the official pages you actually opened or searched in this response.
- Include the official HTTPS source URL in the reader-visible source section and include an information date or final review date.
- For changeable policy or financial facts, state the applicable date and tell the reader where to re-check the current rule.
- For art content, distinguish confirmed artwork metadata from editorial interpretation and give a usable observation order rather than a generic biography summary.
- If an official source cannot be found, do not invent a URL, quote, date, institution, artwork fact, amount, rate, deadline, or eligibility rule. State the limitation and leave the manuscript in review instead of pretending it is verified.
- Web-search results are evidence candidates. Do not claim that Bright Studio or the article guarantees AdSense approval.`;
}

function validateInput(input: GenerationInput): void {
  if (
    !input.platform.trim()
    || !input.contentType.trim()
    || !input.projectId.trim()
  ) {
    throw new Error("Platform, content type, and project are required.");
  }
  if (
    input.keywords.length === 0
    || input.keywords.some((keyword) => !keyword.trim())
  ) {
    throw new Error("At least one non-empty keyword is required.");
  }
}

function editorialOwnedIdentityTerms(
  editorialContext?: string,
): readonly string[] {
  if (!editorialContext?.trim()) return Object.freeze([]);
  try {
    const parsed = JSON.parse(editorialContext) as Record<string, unknown>;
    const strategy = objectValue(parsed.projectStrategy);
    const identity = objectValue(strategy?.projectIdentity);
    if (!identity) return Object.freeze([]);
    return Object.freeze([
      identity.projectName,
      identity.brandName,
    ].filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    ));
  } catch {
    return Object.freeze([]);
  }
}

function objectValue(
  value: unknown,
): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
