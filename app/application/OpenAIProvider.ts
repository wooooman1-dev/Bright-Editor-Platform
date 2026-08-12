import {
  aiUsageStageForTask,
  createAIUsageRecord,
  AIProviderError,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type AIProviderStage,
  type AIWebSource,
} from "../../core/ai";
import { approvalSourcePreflightMaximumClaimsPerSource } from "../../core/ai/ApprovalSourcePreflight";
import {
  approvalOfficialDomains,
  canonicalizeApprovalEvidenceUrl,
  type ApprovalPolicyProfileId,
} from "../../core/approval";
import {
  contentSectionTypes,
  determineContentPlanQualityTarget,
  findUnrequestedOwnedIdentityOccurrences,
  normalizeContentPlanQualityTarget,
  type ContentPlanQualityTarget,
} from "../../core/content";
import { openAIGenerationModel } from "./OpenAIModelPolicy";
import { explicitPlanningOutputFormat } from "./PlanningContracts";

export class AIConfigurationError extends Error {
  constructor(message = "OPENAI_API_KEY is required to generate content.") {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = openAIGenerationModel(),
    private readonly timeoutMs = readTimeout(process.env.OPENAI_REQUEST_TIMEOUT_MS, 600_000),
  ) {}

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new AIConfigurationError();
    if (!isHeaderSafeApiKey(this.apiKey)) {
      throw new AIConfigurationError("OPENAI_API_KEY must contain only printable ASCII characters without whitespace.");
    }
    const editorialOutput = editorialOutputPolicy(request.metadata);
    const webSearch = approvalWebSearchPolicy(request.metadata);
    const requestBody = new TextEncoder().encode(JSON.stringify({
      model: this.model,
      input: request.instruction,
      ...(webSearch ? {
        tools: [webSearch],
        include: ["web_search_call.action.sources"],
      } : {}),
      ...(editorialOutput ? { max_output_tokens: editorialOutput.maxOutputTokens, text: { format: editorialOutput.format, verbosity: editorialOutput.verbosity } } : {}),
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw AIProviderError.provider({
          stage: aiProviderStageForTask(request.metadata?.task),
          message: `OpenAI request timed out after ${this.timeoutMs}ms.`,
        });
      }
      throw AIProviderError.provider({
        stage: aiProviderStageForTask(request.metadata?.task),
        message: error instanceof Error ? error.message : "OpenAI request failed.",
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw AIProviderError.provider({
        stage: aiProviderStageForTask(request.metadata?.task),
        message: `OpenAI request failed (${response.status}).`,
      });
    }
    let responseBody: OpenAIResponseBody;
    try {
      responseBody = await response.json() as OpenAIResponseBody;
    } catch (error) {
      throw AIProviderError.parse({
        stage: aiProviderStageForTask(request.metadata?.task),
        message: error instanceof Error ? error.message : "OpenAI response JSON could not be parsed.",
      });
    }
    const content = responseBody.output_text ?? responseBody.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("");
    const webSources = extractWebSources(responseBody.output ?? []);
    const model = responseBody.model ?? this.model;
    const usage = responseBody.usage;
    const webSearchCalls = responseBody.tool_usage?.web_search?.num_requests
      ?? (responseBody.output ?? []).filter((item) => item.type === "web_search_call").length;
    const aiUsage = createAIUsageRecord({
      stage: aiUsageStageForTask(request.metadata?.task),
      task: request.metadata?.task ?? "unspecified",
      model,
      ...(responseBody.id ? { responseId: responseBody.id } : {}),
      recordedAt: new Date().toISOString(),
      inputTokens: usage?.input_tokens,
      cachedInputTokens: usage?.input_tokens_details?.cached_tokens,
      cacheWriteTokens: usage?.input_tokens_details?.cache_write_tokens,
      outputTokens: usage?.output_tokens,
      reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
      totalTokens: usage?.total_tokens,
      webSearchCalls,
    });
    const diagnostics = Object.freeze({
      stage: aiProviderStageForTask(request.metadata?.task),
      completionStatus: "completed" as const,
      ...(responseBody.id ? { responseId: responseBody.id } : {}),
      ...(responseBody.status ? { status: responseBody.status } : {}),
      ...(responseBody.incomplete_details?.reason ? { incompleteReason: responseBody.incomplete_details.reason } : {}),
      ...(typeof usage?.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
      ...(typeof usage?.input_tokens_details?.cached_tokens === "number" ? { cachedInputTokens: usage.input_tokens_details.cached_tokens } : {}),
      ...(typeof usage?.input_tokens_details?.cache_write_tokens === "number" ? { cacheWriteTokens: usage.input_tokens_details.cache_write_tokens } : {}),
      ...(typeof usage?.output_tokens === "number" ? { outputTokens: usage.output_tokens } : {}),
      ...(typeof usage?.output_tokens_details?.reasoning_tokens === "number" ? { reasoningTokens: usage.output_tokens_details.reasoning_tokens } : {}),
      ...(typeof usage?.total_tokens === "number" ? { totalTokens: usage.total_tokens } : {}),
      webSearchCalls,
      ...(editorialOutput ? { configuredMaxOutputTokens: editorialOutput.maxOutputTokens } : {}),
      structuredOutputPresent: Boolean(content?.trim()),
      requestTimeoutMs: this.timeoutMs,
      elapsedMs: Date.now() - startedAt,
      ...(webSources.length ? { webSources } : {}),
      aiUsage,
    });
    console.info("[openai-response]", {
      ...diagnostics,
      model,
      webSourceCount: webSources.length,
    });
    const stage = aiProviderStageForTask(request.metadata?.task);
    if (responseBody.status === "incomplete") {
      throw AIProviderError.incomplete({
        stage,
        reason: responseBody.incomplete_details?.reason,
        diagnostic: diagnostics,
      });
    }
    if (!content?.trim()) {
      throw AIProviderError.parse({
        stage,
        message: "OpenAI returned an empty response.",
        diagnostic: diagnostics,
      });
    }
    assertOpenAIResponseOwnedIdentityPolicy(request.instruction, content);
    return Object.freeze({ content, model, diagnostics });
  }
}

type OpenAIResponseBody = Readonly<{
  id?: string;
  model?: string;
  status?: string;
  incomplete_details?: Readonly<{ reason?: string }>;
  usage?: Readonly<{
    input_tokens?: number;
    input_tokens_details?: Readonly<{
      cached_tokens?: number;
      cache_write_tokens?: number;
    }>;
    output_tokens?: number;
    output_tokens_details?: Readonly<{ reasoning_tokens?: number }>;
    total_tokens?: number;
  }>;
  tool_usage?: Readonly<{
    web_search?: Readonly<{ num_requests?: number }>;
  }>;
  output_text?: string;
  output?: readonly OpenAIOutputItem[];
}>;

type OpenAIOutputItem = Readonly<{
  type?: string;
  action?: Readonly<{
    sources?: readonly Readonly<{ type?: string; url?: string; title?: string }>[];
  }>;
  content?: readonly Readonly<{
    text?: string;
    annotations?: readonly Readonly<{
      type?: string;
      url?: string;
      title?: string;
      start_index?: number;
      end_index?: number;
    }>[];
  }>[];
}>;

type OwnedIdentityResponsePolicy = Readonly<{
  ownedTerms: readonly string[];
  sourceRequest: string;
  selectionMode: "automatic" | "userSpecified";
}>;

export function assertOpenAIResponseOwnedIdentityPolicy(
  instruction: string,
  responseContent: string,
): void {
  const policy = readOwnedIdentityResponsePolicy(instruction);
  if (!policy) return;
  const contamination = findUnrequestedOwnedIdentityOccurrences({
    ownedTerms: policy.ownedTerms,
    sourceRequest: policy.sourceRequest,
    selectionMode: policy.selectionMode,
    values: [responseContent],
  });
  if (!contamination.length) return;
  throw new Error(
    `AI 응답에 요청하지 않은 프로젝트명 또는 브랜드명이 다시 포함되어 결과 적용을 차단했습니다: ${contamination.join(", ")}.`,
  );
}

export function readOwnedIdentityResponsePolicy(
  instruction: string,
): OwnedIdentityResponsePolicy | undefined {
  const marker = "Canonical server editorial context (mandatory; do not ignore or override):";
  const markerIndex = instruction.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  const objectStart = instruction.indexOf("{", markerIndex + marker.length);
  if (objectStart < 0) return undefined;
  const serialized = balancedJsonObject(instruction, objectStart);
  if (!serialized) return undefined;

  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    const strategy = objectValue(parsed.projectStrategy);
    const identity = objectValue(strategy?.projectIdentity);
    const policy = objectValue(parsed.ownedIdentityPolicy);
    if (!identity || !policy) return undefined;
    const ownedTerms = [identity.projectName, identity.brandName]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (!ownedTerms.length) return undefined;
    return Object.freeze({
      ownedTerms: Object.freeze([...new Set(ownedTerms)]),
      sourceRequest: typeof policy.sourceRequest === "string" ? policy.sourceRequest : "",
      selectionMode: policy.selectionMode === "userSpecified" ? "userSpecified" : "automatic",
    });
  } catch {
    return undefined;
  }
}

function balancedJsonObject(value: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function approvalWebSearchPolicy(metadata?: Readonly<Record<string, string>>) {
  if (metadata?.approvalPurpose !== "adsense_approval") return undefined;
  const task = metadata.task;
  const preflight = task === "approval-source-preflight";
  const legacyInlineSearch = task === "content-generation"
    && metadata.approvalEvidenceMode !== "preflight_verified";
  if (!preflight && !legacyInlineSearch) return undefined;
  const domains = approvalOfficialDomains(metadata.approvalProfileId as ApprovalPolicyProfileId);
  return {
    type: "web_search" as const,
    search_context_size: "high" as const,
    ...(domains ? { filters: { allowed_domains: domains } } : {}),
  };
}

function extractWebSources(output: readonly OpenAIOutputItem[]): readonly AIWebSource[] {
  const sources = new Map<string, AIWebSource>();
  for (const item of output) {
    for (const source of item.action?.sources ?? []) {
      if (!source.url) continue;
      addWebSource(sources, {
        url: source.url,
        ...(source.title ? { title: source.title } : {}),
        provenance: "search_candidate",
      });
    }
    for (const part of item.content ?? []) {
      const text = part.text ?? "";
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== "url_citation" || !annotation.url) continue;
        const start = typeof annotation.start_index === "number" ? annotation.start_index : 0;
        const end = typeof annotation.end_index === "number" ? annotation.end_index : 0;
        const excerpt = end > start ? text.slice(start, end).trim() : "";
        addWebSource(sources, {
          url: annotation.url,
          ...(annotation.title ? { title: annotation.title } : {}),
          ...(excerpt ? { excerpt } : {}),
          provenance: "citation",
        });
      }
    }
  }
  return Object.freeze([...sources.values()]);
}

function addWebSource(sources: Map<string, AIWebSource>, source: AIWebSource): void {
  const key = canonicalizeApprovalEvidenceUrl(source.url);
  let url: URL;
  try {
    url = new URL(key);
  } catch {
    return;
  }
  if (url.protocol !== "https:") return;
  const previous = sources.get(key);
  const provenance = source.provenance === "citation" || previous?.provenance === "citation"
    ? "citation"
    : "search_candidate";
  sources.set(key, Object.freeze({
    url: key,
    ...(source.title || previous?.title ? { title: source.title ?? previous?.title } : {}),
    ...(source.excerpt || previous?.excerpt ? { excerpt: source.excerpt ?? previous?.excerpt } : {}),
    provenance,
  }));
}

function isHeaderSafeApiKey(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value);
}

function readTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function aiProviderStageForTask(task: string | undefined): AIProviderStage {
  if (task === "content-planning") return "planning";
  if (task === "approval-source-preflight") return "source_preflight";
  if (task === "content-generation") return "generation";
  return "quality_review";
}

function editorialOutputPolicy(metadata?: Readonly<Record<string, string>>) {
  if (metadata?.task === "content-planning" && metadata.explicitVerificationPlanning === "1") return { maxOutputTokens: 12_000, verbosity: "medium" as const, format: explicitPlanningOutputFormat };
  if (metadata?.task === "approval-source-preflight") {
    // 추론 토큰이 max_output_tokens 안에서 소비된다. 프리플라이트는 웹 검색을 여러 번 돌리고
    // 거부된 페이지의 추출 텍스트를 재시도 피드백으로 되받으므로 추론량이 다른 단계만큼 크다.
    // 4,000 에서는 추론이 3,628 을 쓰고 남은 372 로 구조화 출력을 내지 못해 응답이
    // incomplete: max_output_tokens 로 끊겼다. 다른 추론 단계와 같은 예산을 준다.
    return {
      maxOutputTokens: 12_000,
      verbosity: "low" as const,
      format: metadata.verificationMode === "explicit" ? explicitApprovalSourcePreflightFormat : approvalSourcePreflightFormat,
    };
  }
  if (metadata?.task === "content-generation") {
    const target = parseQualityTarget(metadata.qualityTarget);
    const verificationClaims = metadata.verificationGenerationMode === "structured_claims_v1"
      || metadata.verificationGenerationMode === "structured_claims_v2";
    return {
      maxOutputTokens: outputTokenBudget(target),
      verbosity: "medium" as const,
      format: structuredGenerationFormat(target, { verificationClaims }),
    };
  }
  if (metadata?.task === "quality-final-edit" || metadata?.task === "quality-auto-improvement") return { maxOutputTokens: 12_000, verbosity: "high" as const, format: metadata.factualInventoryMode === "structured_claims_v2" ? editorialDocumentWithFactualInventoryFormat : editorialDocumentFormat };
  if (/tistory|blog|article|long-form|guide|아티클|장문/i.test(`${metadata?.platform ?? ""} ${metadata?.contentType ?? ""}`)) return { maxOutputTokens: 12_000, verbosity: "medium" as const, format: editorialDocumentFormat };
  return undefined;
}

export const approvalSourcePreflightFormat = {
  type: "json_schema",
  name: "approval_source_preflight",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sources"],
    properties: {
      sources: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "title", "evidenceExcerpt", "claims"],
          properties: {
            url: { type: "string", maxLength: 2048 },
            title: { type: "string", maxLength: 240 },
            evidenceExcerpt: {
              type: "string",
              maxLength: 600,
              description: "A contiguous verbatim passage from the canonical extracted text of the fetched document body, including visible headings and excluding title, metadata, search snippets, navigation, scripts, and styles. Do not paraphrase, summarize, or synthesize passages.",
            },
            claims: {
              type: "array",
              minItems: 1,
              maxItems: approvalSourcePreflightMaximumClaimsPerSource,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["field", "value", "evidenceExcerpt"],
                properties: {
                  field: { type: "string", maxLength: 160 },
                  value: { type: "string", maxLength: 400 },
                  evidenceExcerpt: {
                    type: "string",
                    maxLength: 600,
                    description: "A contiguous verbatim passage from the canonical extracted text of this fetched document body supporting the Claim. Do not paraphrase or synthesize.",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const explicitApprovalSourcePreflightFormat = {
  type: "json_schema",
  name: "explicit_approval_source_preflight",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sources"],
    properties: {
      sources: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "title", "evidenceExcerpt", "claims"],
          properties: {
            url: { type: "string", maxLength: 2048 }, title: { type: "string", maxLength: 240 }, evidenceExcerpt: {
              type: "string",
              maxLength: 600,
              description: "A contiguous verbatim passage from the canonical extracted text of the fetched document body, including visible headings and excluding title, metadata, search snippets, navigation, scripts, and styles. Do not paraphrase, summarize, or synthesize passages.",
            },
            claims: { type: "array", minItems: 1, maxItems: approvalSourcePreflightMaximumClaimsPerSource, items: {
              type: "object", additionalProperties: false, required: ["claimId", "value", "evidenceExcerpt"],
              properties: {
                claimId: { type: "string", maxLength: 160 },
                value: { type: "string", maxLength: 400, description: "The shortest verbatim factual phrase contained inside this claim evidenceExcerpt. Never paraphrase." },
                evidenceExcerpt: {
                  type: "string",
                  maxLength: 600,
                  description: "A contiguous verbatim passage from the canonical extracted text of this fetched document body supporting the Claim. Do not paraphrase or synthesize.",
                },
              },
            } },
          },
        },
      },
    },
  },
} as const;

const structuredGenerationRequired = Object.freeze([
  "title",
  "seoTitle",
  "metaDescription",
  "primarySearchIntent",
  "secondaryIntent",
  "secondaryKeywords",
  "relatedTerms",
  "tags",
  "introduction",
  "sections",
  "conclusion",
  "images",
  "cta",
]);

const generatedFactualClaimSchema = {
  type: "array",
  maxItems: 48,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "claimId",
      "planningClaimId",
      "origin",
      "risk",
      "surfaceText",
      "statement",
      "kind",
      "normalizedValueJson",
      "qualifiers",
      "temporalRequirementJson",
      "evidenceUrl",
      "evidenceExcerpt",
    ],
    properties: {
      claimId: { type: "string" },
      planningClaimId: { type: "string" },
      origin: { type: "string", enum: ["planning", "generation", "quality_review"] },
      risk: { type: "string", enum: ["verify", "critical"] },
      surfaceText: { type: "string" },
      statement: { type: "string" },
      kind: {
        type: "string",
        enum: ["money", "ratio", "date", "dateRange", "duration", "location", "eligibility", "legal", "general"],
      },
      normalizedValueJson: { type: "string" },
      qualifiers: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "scope", "basis", "note"],
        properties: {
          subject: { type: "string" },
          scope: { type: "string" },
          basis: { type: "string" },
          note: { type: "string" },
        },
      },
      temporalRequirementJson: { type: "string" },
      evidenceUrl: { type: "string" },
      evidenceExcerpt: { type: "string" },
    },
  },
} as const;

export function structuredGenerationFormat(
  target: ContentPlanQualityTarget = determineContentPlanQualityTarget({ contentType: "article" }),
  options: Readonly<{ verificationClaims?: boolean }> = {},
) {
  const required = options.verificationClaims
    ? Object.freeze([...structuredGenerationRequired, "verificationClaimsUsed"])
    : structuredGenerationRequired;
  return {
    type: "json_schema",
    name: `structured_${target.contentDepth}${options.verificationClaims ? "_verified" : ""}_generation`,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required,
      properties: {
        title: { type: "string" },
        seoTitle: { type: "string" },
        metaDescription: { type: "string" },
        primarySearchIntent: { type: "string" },
        secondaryIntent: { type: "string" },
        secondaryKeywords: { type: "array", items: { type: "string" } },
        relatedTerms: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        introduction: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        sections: { type: "array", minItems: 1, maxItems: 12, items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "sectionType", "paragraphs"],
          properties: {
            heading: { type: "string" },
            sectionType: { type: "string", enum: contentSectionTypes },
            paragraphs: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
          },
        } },
        conclusion: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        images: { type: "array", maxItems: 1, items: {
          type: "object",
          additionalProperties: false,
          required: ["afterSection", "purpose", "alt", "prompt"],
          properties: {
            afterSection: { type: "integer", enum: [0] },
            purpose: { type: "string", enum: ["hero"] },
            alt: { type: "string" },
            prompt: { type: "string" },
          },
        } },
        cta: { type: "array", items: {
          type: "object",
          additionalProperties: false,
          required: ["afterSection", "purpose", "label", "targetUrl", "target"],
          properties: {
            afterSection: { type: "integer" },
            purpose: { type: "string", enum: ["cta"] },
            label: { type: "string" },
            targetUrl: { type: "string" },
            target: { type: "string", enum: ["_self", "_blank"] },
          },
        } },
        ...(options.verificationClaims
          ? { verificationClaimsUsed: generatedFactualClaimSchema }
          : {}),
      },
    },
  } as const;
}

function parseQualityTarget(raw: string | undefined): ContentPlanQualityTarget {
  if (!raw) return determineContentPlanQualityTarget({ contentType: "article" });
  try {
    return normalizeContentPlanQualityTarget(JSON.parse(raw) as ContentPlanQualityTarget, { contentType: "article" });
  } catch {
    return determineContentPlanQualityTarget({ contentType: "article" });
  }
}

function outputTokenBudget(target: ContentPlanQualityTarget): number {
  return target.contentDepth === "deep" || target.contentDepth === "comparison" ? 14_000 : 11_000;
}

const editorialDocumentFormat = {
  type: "json_schema",
  name: "canonical_content_document",
  strict: false,
  schema: {
    type: "object",
    required: ["title", "blocks"],
    properties: {
      title: { type: "string" },
      seoTitle: { type: "string" },
      metaDescription: { type: "string" },
      primarySearchIntent: { type: "string" },
      secondaryIntent: { type: "string" },
      secondaryKeywords: { type: "array", items: { type: "string" } },
      relatedTerms: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      blocks: { type: "array", items: { type: "object", required: ["type"], properties: {
        type: { type: "string", enum: ["heading", "paragraph", "list", "table", "image", "button"] },
        level: { type: "integer" },
        text: { type: "string" },
        style: { type: "string", enum: ["ordered", "unordered"] },
        items: { type: "array", items: { type: "string" } },
        headers: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        caption: { type: "string" },
        source: { type: "string" },
        alt: { type: "string" },
        prompt: { type: "string" },
        purpose: { type: "string", enum: ["hero", "inline", "comparison", "checklist", "infographic", "summary", "warning", "cta", "internal_link", "monetization", "related_post"] },
        assetId: { type: "string" },
        fileName: { type: "string" },
        mimeType: { type: "string" },
        sourceType: { type: "string", enum: ["planned", "upload", "ai_generated", "external"] },
        label: { type: "string" },
        targetUrl: { type: "string" },
        target: { type: "string", enum: ["_self", "_blank"] },
        sourceExternalPostId: { type: "string" },
      } } },
    },
  },
} as const;

const editorialDocumentWithFactualInventoryFormat = {
  ...editorialDocumentFormat,
  name: "canonical_content_document_with_factual_inventory",
  schema: {
    ...editorialDocumentFormat.schema,
    required: [...editorialDocumentFormat.schema.required, "verificationClaimsUsed"],
    properties: {
      ...editorialDocumentFormat.schema.properties,
      verificationClaimsUsed: generatedFactualClaimSchema,
    },
  },
} as const;
