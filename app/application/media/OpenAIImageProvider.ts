import type {
  ImageGenerationQuality,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerationSize,
  ImageProvider,
} from "../../../core/media";
import { AIConfigurationError } from "../OpenAIProvider";

export class OpenAIImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    private readonly timeoutMs = readTimeout(process.env.OPENAI_IMAGE_TIMEOUT_MS, 180_000),
  ) {}

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!this.apiKey) throw new AIConfigurationError("OPENAI_API_KEY is required to generate images.");
    if (!isHeaderSafeApiKey(this.apiKey)) throw new AIConfigurationError("OPENAI_API_KEY must contain only printable ASCII characters without whitespace.");

    const prompt = request.prompt.trim();
    if (!prompt) throw new Error("이미지 프롬프트를 입력해 주세요.");
    const size = normalizeSize(request.size);
    const quality = normalizeQuality(request.quality);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt, size, quality, output_format: "png" }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`OpenAI image request timed out after ${this.timeoutMs}ms.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await safeErrorMessage(response);
      throw new Error(`OpenAI image request failed (${response.status})${detail ? `: ${detail}` : "."}`);
    }

    const body = await response.json() as { data?: readonly Readonly<{ b64_json?: string }>[] };
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) throw new Error("OpenAI returned an empty image response.");
    const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
    if (!bytes.byteLength) throw new Error("OpenAI returned invalid image data.");

    return Object.freeze({
      bytes,
      fileExtension: "png" as const,
      mimeType: "image/png" as const,
      model: this.model,
      quality,
      size,
    });
  }
}

function normalizeSize(value: ImageGenerationSize | undefined): ImageGenerationSize {
  return value === "1024x1536" || value === "1536x1024" ? value : "1024x1024";
}

function normalizeQuality(value: ImageGenerationQuality | undefined): ImageGenerationQuality {
  return value === "low" || value === "high" ? value : "medium";
}

function isHeaderSafeApiKey(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value);
}

function readTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function safeErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: unknown } };
    return typeof body.error?.message === "string" ? body.error.message : "";
  } catch {
    return "";
  }
}
