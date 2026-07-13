import type { AIProvider, AIRequest, AIResponse } from "../../core/ai";

export class AIConfigurationError extends Error {
  constructor(message = "OPENAI_API_KEY is required to generate content.") {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.OPENAI_MODEL ?? "gpt-5-mini",
    private readonly timeoutMs = readTimeout(process.env.OPENAI_REQUEST_TIMEOUT_MS, 120_000),
  ) {}

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new AIConfigurationError();
    if (!isHeaderSafeApiKey(this.apiKey)) {
      throw new AIConfigurationError("OPENAI_API_KEY must contain only printable ASCII characters without whitespace.");
    }
    const requestBody = new TextEncoder().encode(JSON.stringify({ model: this.model, input: request.instruction }));
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
