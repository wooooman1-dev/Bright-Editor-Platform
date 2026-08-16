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
} from "../../../core/content";
import {
  openAIGenerationModel,
  openAISourcePreflightModel,
} from "./OpenAIModelPolicy";
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
    const model = request.metadata?.task === "approval-source-preflight"
      ? openAISourcePreflightModel()
      : this.model;
    const editorialOutput = editorialOutputPolicy(request.metadata);
    const webSearch = approvalWebSearchPolicy(request.metadata);
    const requestBody = new TextEncoder().encode(JSON.stringify({
      model,
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
    const responseModel = responseBody.model ?? model;
    const usage = responseBody.usage;
    const webSearchCalls = responseBody.tool_usage?.web_search?.num_requests
      ?? (responseBody.output ?? []).filter((item) => item.type === "web_search_call").length;
    const aiUsage = createAIUsageRecord({
      stage: aiUsageStageForTask(request.metadata?.task),
      task: request.metadata?.task ?? "unspecified",
      model: responseModel,
      ...(responseBody.id ? { responseId: responseBody.id } : {}),
      recordedAt: new Date().toISOString(),
      inputTokens: usage?.input_tokens,
      cachedInputTokens: usage?.input_tokens_details?.cached_tokens,
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
      model: responseModel,
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
    return Object.freeze({ content, model: responseModel, diagnostics });
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
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return undefined;
}
