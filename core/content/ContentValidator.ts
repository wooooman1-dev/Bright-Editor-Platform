import type { ContentDocument } from "./ContentDocument";

export type ContentValidationIssue = Readonly<{
  blockId?: string;
  code: string;
  message: string;
}>;

export type ContentValidationResult = Readonly<{
  issues: readonly ContentValidationIssue[];
  valid: boolean;
}>;

export interface ContentValidator {
  validate(document: ContentDocument): ContentValidationResult;
}
