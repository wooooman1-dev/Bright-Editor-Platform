import type { ContentBlock } from "./ContentBlock";
import { contentBlockTypes } from "./ContentBlockType";
import type { ContentDocument } from "./ContentDocument";

export type ContentValidationIssueCode =
  | "DUPLICATE_BLOCK_ID"
  | "INVALID_HEADING_HIERARCHY"
  | "INVALID_TABLE"
  | "MISSING_IMAGE_ALT"
  | "UNSUPPORTED_BLOCK_TYPE"
  | "INVALID_VIDEO_URL";

export type ContentValidationSeverity = "error" | "warning" | "info";

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

export type DetailedContentValidationIssue = ContentValidationIssue &
  Readonly<{
    code: ContentValidationIssueCode;
    severity: ContentValidationSeverity;
  }>;

export type DetailedContentValidationResult = ContentValidationResult &
  Readonly<{
    errors: readonly DetailedContentValidationIssue[];
    infos: readonly DetailedContentValidationIssue[];
    issues: readonly DetailedContentValidationIssue[];
    warnings: readonly DetailedContentValidationIssue[];
  }>;

export class DefaultContentValidator implements ContentValidator {
  validate(document: ContentDocument): DetailedContentValidationResult {
    const issues = [
      ...validateBlockIds(document.blocks),
      ...validateBlocks(document.blocks),
    ];
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    const infos = issues.filter((issue) => issue.severity === "info");

    return Object.freeze({
      errors: Object.freeze(errors),
      infos: Object.freeze(infos),
      issues: Object.freeze(issues),
      valid: errors.length === 0,
      warnings: Object.freeze(warnings),
    });
  }
}

function validateBlockIds(
  blocks: readonly ContentBlock[],
): DetailedContentValidationIssue[] {
  const seenIds = new Set<string>();
  const issues: DetailedContentValidationIssue[] = [];

  for (const block of blocks) {
    if (seenIds.has(block.id)) {
      issues.push(createIssue("DUPLICATE_BLOCK_ID", "error", block.id));
    }
    seenIds.add(block.id);
  }

  return issues;
}

function validateBlocks(
  blocks: readonly ContentBlock[],
): DetailedContentValidationIssue[] {
  const issues: DetailedContentValidationIssue[] = [];
  let previousHeadingLevel: number | undefined;

  for (const block of blocks) {
    if (!contentBlockTypes.includes(block.type)) {
      issues.push(createIssue("UNSUPPORTED_BLOCK_TYPE", "error", block.id));
      continue;
    }

    if (block.type === "heading") {
      if (
        previousHeadingLevel !== undefined &&
        block.level > previousHeadingLevel + 1
      ) {
        issues.push(
          createIssue("INVALID_HEADING_HIERARCHY", "warning", block.id),
        );
      }
      previousHeadingLevel = block.level;
    }

    if (block.type === "table" && (
      !block.headers.length
      || !block.headers.some((cell) => cell.trim())
      || !block.rows.length
      || block.rows.some((row) => row.length !== block.headers.length)
    )) {
      issues.push(createIssue("INVALID_TABLE", "error", block.id));
    }

    if (block.type === "image" && block.alt.trim().length === 0) {
      issues.push(createIssue("MISSING_IMAGE_ALT", "warning", block.id));
    }

    if (block.type === "video" && !isValidVideoUrl(block.source)) {
      issues.push(createIssue("INVALID_VIDEO_URL", "error", block.id));
    }
  }

  return issues;
}

function isValidVideoUrl(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createIssue(
  code: ContentValidationIssueCode,
  severity: ContentValidationSeverity,
  blockId: string,
): DetailedContentValidationIssue {
  const messages: Record<ContentValidationIssueCode, string> = {
    DUPLICATE_BLOCK_ID: "Block IDs must be unique.",
    INVALID_HEADING_HIERARCHY:
      "Heading levels must not skip hierarchy levels.",
    INVALID_TABLE: "Tables must include headers, rows, and a consistent column count.",
    INVALID_VIDEO_URL: "Video sources must be valid HTTP or HTTPS URLs.",
    MISSING_IMAGE_ALT: "Images should include alternative text.",
    UNSUPPORTED_BLOCK_TYPE: "The content block type is not supported.",
  };

  return Object.freeze({ blockId, code, message: messages[code], severity });
}
