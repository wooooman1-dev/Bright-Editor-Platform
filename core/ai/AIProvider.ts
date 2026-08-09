import type { AIUsageRecord } from "./AIUsageCost";

export type AIRequest = Readonly<{
  instruction: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export const aiProviderStages = [
  "planning",
  "source_preflight",
  "generation",
  "quality_review",
] as const;

export type AIProviderStage = (typeof aiProviderStages)[number];

export type AIProviderCompletionStatus =
  | "completed"
  | "incomplete_max_output_tokens"
  | "incomplete_content_filter"
  | "provider_error"
  | "parse_error";

export type AIWebSource = Readonly<{
  url: string;
  title?: string;
  excerpt?: string;
  provenance: "search_candidate" | "citation";
}>;

export type AIResponse = Readonly<{
  content: string;
  model: string;
  diagnostics?: Readonly<{
    stage?: AIProviderStage;
    completionStatus?: AIProviderCompletionStatus;
    responseId?: string;
    status?: string;
    incompleteReason?: string;
    inputTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    webSearchCalls?: number;
    configuredMaxOutputTokens?: number;
    structuredOutputPresent?: boolean;
    requestTimeoutMs?: number;
    elapsedMs?: number;
    webSources?: readonly AIWebSource[];
    aiUsage?: AIUsageRecord;
  }>;
}>;

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly diagnostic: Readonly<NonNullable<AIResponse["diagnostics"]>>,
  ) {
    super(message);
    this.name = "AIProviderError";
  }

  static incomplete(input: Readonly<{
    stage: AIProviderStage;
    reason?: string;
    diagnostic: Readonly<NonNullable<AIResponse["diagnostics"]>>;
  }>): AIProviderError {
    const status: AIProviderCompletionStatus = input.reason === "content_filter"
      ? "incomplete_content_filter"
      : input.reason === "max_output_tokens"
        ? "incomplete_max_output_tokens"
        : "provider_error";
    const diagnostic = Object.freeze({
      ...input.diagnostic,
      stage: input.stage,
      completionStatus: status,
    });
    return new AIProviderError(
      `OpenAI response was incomplete${input.reason ? `: ${input.reason}` : "."}`,
      diagnostic,
    );
  }

  static provider(input: Readonly<{
    stage: AIProviderStage;
    message: string;
    diagnostic?: Readonly<NonNullable<AIResponse["diagnostics"]>>;
  }>): AIProviderError {
    return new AIProviderError(input.message, Object.freeze({
      ...(input.diagnostic ?? {}),
      stage: input.stage,
      completionStatus: "provider_error",
    }));
  }

  static parse(input: Readonly<{
    stage: AIProviderStage;
    message: string;
    diagnostic?: Readonly<NonNullable<AIResponse["diagnostics"]>>;
  }>): AIProviderError {
    return new AIProviderError(input.message, Object.freeze({
      ...(input.diagnostic ?? {}),
      stage: input.stage,
      completionStatus: "parse_error",
    }));
  }
}

export interface AIProvider {
  generate(request: AIRequest): Promise<AIResponse>;
}
