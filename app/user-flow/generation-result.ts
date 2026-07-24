import type { ContentDocument, LongFormDiagnostic } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import type { UserData } from "./user-data";

export type GenerationCompletionResult = Readonly<{
  data?: UserData;
  document?: ContentDocument;
  error?: string;
  quality?: QualityReport;
  qualityTargetBlocked?: boolean;
  reachedTarget?: boolean;
  diagnostic?: LongFormDiagnostic;
}>;

export class GenerationCompletionError extends Error {
  constructor(message: string, readonly diagnostic?: LongFormDiagnostic) {
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
