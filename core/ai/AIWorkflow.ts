import {
  approvalPolicySnapshotFromEditorialContext,
  canonicalizeApprovalEvidenceUrl,
  createGeneratedClaimVerificationRecord,
  validateGeneratedFactualClaimDrafts,
  type ApprovalEvidenceFact,
  type ApprovalEvidenceSource,
  type ApprovalPolicySnapshot,
  type GeneratedClaimBinding,
  type GeneratedFactualClaim,
  type VerificationSnapshot,
} from "../approval";
import type { ApprovalSourcePreflightCoverageResult } from "../approval/ApprovalSourcePreflightCoverage";
import {
  findUnrequestedOwnedIdentityOccurrences,
  findUnrequestedOwnedIdentityPrefixes,
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
  parseGeneratedFactualClaimDrafts,
  withGeneratedFactualClaimResponseInstruction,
} from "./GeneratedFactualClaimResponse";
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
      const explicitVerificationGeneration = Boolean(
        generationPreflight
        && "gate" in generationPreflight
        && input.contentOpportunity?.verificationPlan?.claims.some(isCriticalVerificationClaim)
        && sourcePreflight?.verificationSnapshot,
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
      const instruction = withVerificationClaimRiskInstruction(explicitVerificationGeneration
        ? withGeneratedFactualClaimResponseInstruction(preflightInstruction)
        : preflightInstruction, input.contentOpportunity);
      const response = await this.provider.generate({
        ...request,
        instruction,
        metadata: {
          contentType: input.contentType,
          platform: input.platform,
          ...(input.structuredLongFormOutput
            ? { task: "content-generation" }
            : {}),
          ...(explicitVerificationGeneration
            ? { verificationGenerationMode: "structured_claims_v1" }
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
                approvalEvidenceMode: sourcePreflight
                  ? "preflight_verified"
                  : "inline_search",
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
        generationPreflight?.sources ?? response.diagnostics?.webSources ?? [],
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

      let semanticClaims: readonly GeneratedFactualClaim[] | undefined;
      if (
        generationPreflight
        && "gate" in generationPreflight
        && input.contentOpportunity?.verificationPlan?.claims.some(isCriticalVerificationClaim)
        && sourcePreflight?.verificationSnapshot
      ) {
        const semanticValidation = validateGeneratedFactualClaimDrafts({
          document: generatedDocument,
          plan: input.contentOpportunity.verificationPlan,
          snapshot: sourcePreflight.verificationSnapshot,
          gate: generationPreflight.gate,
          drafts: parseGeneratedFactualClaimDrafts(response.content),
        });
        if (!semanticValidation.passed) {
          throw new Error(
            `Generated factual Claim semantic verification failed. ${semanticValidation.reasons.join(" ")}`,
          );
        }
        semanticClaims = semanticValidation.claims;
      }

      const generatedClaimVerification = generationPreflight
        && "gate" in generationPreflight
        && input.contentOpportunity?.verificationPlan?.claims.some(isCriticalVerificationClaim)
        && sourcePreflight?.verificationSnapshot
        ? createGeneratedClaimVerificationRecord({
            document: generatedDocument,
            plan: input.contentOpportunity.verificationPlan,
            snapshot: sourcePreflight.verificationSnapshot,
            boundEditorialRevisionId: editorialRevisionId(generatedDocument),
            semanticClaims,
          })
        : undefined;
      const canonicalGeneratedDocument = generatedClaimVerification
        ? Object.freeze({
            ...generatedDocument,
            metadata: Object.freeze({
              ...generatedDocument.metadata!,
              generatedClaimVerification,
            }),
          })
        : generatedDocument;
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

function withVerificationClaimRiskInstruction(
  instruction: string,
  opportunity: ConfirmedContentOpportunity | undefined,
): string {
  const verifyClaims = opportunity?.verificationPlan?.claims.filter((claim) =>
    !isCriticalVerificationClaim(claim) && claim.risk === "verify") ?? [];
  if (!verifyClaims.length) return instruction;
  return `${instruction}\n\nVerification risk rule: the following VERIFY Claims are optional and have no mandatory Evidence bundle: ${JSON.stringify(verifyClaims.map((claim) => ({ claimId: claim.claimId, statement: claim.statement, rawValue: claim.rawValue })))}. Do not state an unsupported concrete VERIFY value as fact. When it cannot be supported by the available Evidence, remove it or generalize it into non-factual guidance. NONE Claims are editorial guidance and require no source.`;
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
  );
  if (!candidates.length) return document;
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata,
      approvalEvidence: Object.freeze({
        version: "1.0" as const,
        status: "needs_review" as const,
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

function approvalEvidenceCandidates(
  webSources: readonly AIWebSource[],
  snapshot: ApprovalPolicySnapshot,
  retrievedAt: string,
  claimSources: readonly ApprovalSourcePreflightClaimSource[],
): readonly ApprovalEvidenceSource[] {
  const claimsByUrl = new Map(claimSources.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source.claims,
  ]));
  const candidates = new Map<string, ApprovalEvidenceSource>();
  for (const source of webSources) {
    const url = canonicalizeApprovalEvidenceUrl(source.url);
    if (!url.startsWith("https://") || candidates.has(url)) continue;
    const publisher = sourcePublisher(url);
    const provenance = source.provenance === "citation"
      ? "citation"
      : "search_candidate";
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
      verified: false,
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
      cited: provenance === "citation",
      selected: provenance === "citation",
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
