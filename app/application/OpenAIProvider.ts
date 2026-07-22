import type { AIProvider, AIRequest, AIResponse } from "../../core/ai";
import { openAIGenerationModel } from "./OpenAIModelPolicy";

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
    private readonly timeoutMs = readTimeout(process.env.OPENAI_REQUEST_TIMEOUT_MS, 120_000),
  ) {}

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new AIConfigurationError();
    if (!isHeaderSafeApiKey(this.apiKey)) {
      throw new AIConfigurationError("OPENAI_API_KEY must contain only printable ASCII characters without whitespace.");
    }
    const editorialOutput = editorialOutputPolicy(request.metadata);
    const requestBody = new TextEncoder().encode(JSON.stringify({
      model: this.model,
      input: request.instruction,
      ...(editorialOutput ? { max_output_tokens: editorialOutput.maxOutputTokens, text: { format: editorialDocumentFormat, verbosity: editorialOutput.verbosity } } : {}),
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`OpenAI request timed out after ${this.timeoutMs}ms.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
    const responseBody = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const content = responseBody.output_text ?? responseBody.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("");
    if (!content?.trim()) throw new Error("OpenAI returned an empty response.");
    return Object.freeze({ content, model: this.model });
  }
}

function isHeaderSafeApiKey(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value);
}

function readTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function editorialOutputPolicy(metadata?: Readonly<Record<string, string>>) {
  if (metadata?.task === "quality-final-edit" || metadata?.task === "quality-auto-improvement") return { maxOutputTokens: 12_000, verbosity: "high" as const };
  if (/tistory|blog|article|long-form|guide|아티클|장문/i.test(`${metadata?.platform ?? ""} ${metadata?.contentType ?? ""}`)) return { maxOutputTokens: 12_000, verbosity: "medium" as const };
  return undefined;
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
      metaDescription: { type: "string" },
      primarySearchIntent: { type: "string" },
      secondaryIntent: { type: "string" },
      secondaryKeywords: { type: "array", items: { type: "string" } },
      relatedTerms: { type: "array", items: { type: "string" } },
      blocks: { type: "array", items: { type: "object", required: ["type"], properties: {
        type: { type: "string", enum: ["heading", "paragraph", "image", "button"] },
        level: { type: "integer" },
        text: { type: "string" },
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
