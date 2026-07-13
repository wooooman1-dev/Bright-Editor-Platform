import type { ContentDocument } from "../content";
import type { AIProvider } from "./AIProvider";

export type PlatformId = string & { readonly __platformId: unique symbol };
export type ContentTypeId = string & { readonly __contentTypeId: unique symbol };

export type GenerationInput = Readonly<{
  contentId?: string;
  contentType: ContentTypeId;
  editorialContext?: string;
  keywords: readonly string[];
  platform: PlatformId;
  projectId: string;
}>;

export type GenerationResult = Readonly<{
  document: ContentDocument;
  rawResponse: string;
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
    this.state = Object.freeze({ status: "generating" });
    try {
      const request = this.strategy.createRequest(input);
      const response = await this.provider.generate({
        ...request,
        metadata: { contentType: input.contentType, platform: input.platform },
      });
      const result = Object.freeze({
        document: this.strategy.parse(response.content, input),
        rawResponse: response.content,
      });
      this.state = Object.freeze({ result, status: "generated" });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI generation failed.";
      this.state = Object.freeze({ error: message, status: "failed" });
      throw error;
    }
  }
}

function validateInput(input: GenerationInput): void {
  if (!input.platform.trim() || !input.contentType.trim() || !input.projectId.trim()) {
    throw new Error("Platform, content type, and project are required.");
  }
  if (input.keywords.length === 0 || input.keywords.some((keyword) => !keyword.trim())) {
    throw new Error("At least one non-empty keyword is required.");
  }
}
