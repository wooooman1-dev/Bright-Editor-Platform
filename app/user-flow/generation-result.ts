import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import type { UserData } from "./user-data";

export type GenerationCompletionResult = Readonly<{
  data?: UserData;
  document?: ContentDocument;
  error?: string;
  quality?: QualityReport;
  qualityTargetBlocked?: boolean;
  reachedTarget?: boolean;
}>;

export function generatedDocumentReady(result: GenerationCompletionResult): boolean {
  return Boolean(
    result.document
    && result.quality?.approved === true
    && result.reachedTarget === true
    && result.qualityTargetBlocked !== true,
  );
}

export function diagnosticDocumentAvailable(result: GenerationCompletionResult): boolean {
  return Boolean(
    result.data
    && result.quality
    && (
      result.qualityTargetBlocked === true
      || result.reachedTarget === false
      || result.quality.approved === false
    )
  );
}
