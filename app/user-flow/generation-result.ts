import type { ContentDocument, LongFormDiagnostic } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import type { ApprovalSourcePreflightDiagnostic } from "../../core/approval";
import type { AIResponse } from "../../core/ai";
import type { UserData } from "./user-data";

export type GenerationCompletionResult = Readonly<{
  data?: UserData;
  document?: ContentDocument;
  error?: string;
  quality?: QualityReport;
  qualityTargetBlocked?: boolean;
  reachedTarget?: boolean;
  diagnostic?: LongFormDiagnostic;
  approvalSourcePreflightDiagnostic?: ApprovalSourcePreflightDiagnostic;
  aiProviderDiagnostic?: AIResponse["diagnostics"];
}>;

export class GenerationCompletionError extends Error {
  constructor(
    message: string,
    readonly diagnostic?: LongFormDiagnostic,
    readonly approvalSourcePreflightDiagnostic?: ApprovalSourcePreflightDiagnostic,
    readonly aiProviderDiagnostic?: AIResponse["diagnostics"],
  ) {
    super(message);
    this.name = "GenerationCompletionError";
  }
}

export function generatedDocumentReady(result: GenerationCompletionResult): boolean {
  return Boolean(
    result.document
    && result.quality?.approved === true
    && result.quality.approvalType === "standard"
    && result.reachedTarget === true
    && result.qualityTargetBlocked !== true,
  );
}

/** A structurally valid generated manuscript remains editable even when quality approval is pending. */
export function generatedDocumentEditable(result: GenerationCompletionResult): boolean {
  return Boolean(result.document);
}
