import { approvalPolicySnapshotFromEditorialContext } from "../approval";
import type { ConfirmedContentOpportunity, ContentDocument } from "../content";
import type { AIProvider, AIResponse } from "./AIProvider";

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
  providerDiagnostics?: AIResponse["diagnostics"];
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
      const approvalSnapshot = approvalPolicySnapshotFromEditorialContext(input.editorialContext);
      const response = await this.provider.generate({
        ...request,
        instruction: withCanonicalEditorialContext(request.instruction, input.editorialContext),
        metadata: {
          contentType: input.contentType,
          platform: input.platform,
          ...(input.structuredLongFormOutput ? { task: "content-generation" } : {}),
          ...(input.contentOpportunity?.qualityTarget
            ? { qualityTarget: JSON.stringify(input.contentOpportunity.qualityTarget) }
            : {}),
          ...(approvalSnapshot ? {
            approvalPurpose: approvalSnapshot.contentPurpose,
            approvalProfileId: approvalSnapshot.profileId,
            approvalPolicyVersion: approvalSnapshot.policyVersion,
          } : {}),
        },
      });
      const parsedDocument = this.strategy.parse(response.content, input);
      const result = Object.freeze({
        document: withApprovalPolicyMetadata(parsedDocument, input.editorialContext),
        rawResponse: response.content,
        ...(response.diagnostics ? { providerDiagnostics: response.diagnostics } : {}),
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

export function withCanonicalEditorialContext(instruction: string, editorialContext?: string): string {
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
    throw new Error("Approval preparation generation requires canonical document metadata.");
  }
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata,
      approvalPolicy: snapshot,
    }),
  });
}

function validateInput(input: GenerationInput): void {
  if (!input.platform.trim() || !input.contentType.trim() || !input.projectId.trim()) {
    throw new Error("Platform, content type, and project are required.");
  }
  if (input.keywords.length === 0 || input.keywords.some((keyword) => !keyword.trim())) {
    throw new Error("At least one non-empty keyword is required.");
  }
}
