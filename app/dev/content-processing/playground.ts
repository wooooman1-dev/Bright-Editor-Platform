import {
  ContentPipeline,
  type ContentDocument,
  type ContentPipelineResult,
  type ContentValidationIssue,
  type ContentValidationResult,
} from "../../../core/content";

export const contentProcessingSamples = {
  valid: {
    label: "Valid Document",
    document: {
      blocks: [
        { id: "heading-1", level: 2, text: "Sprint 2", type: "heading" },
        {
          id: "paragraph-1",
          text: "The content pipeline is ready for verification.",
          type: "paragraph",
        },
      ],
      id: "valid-document",
      title: "Valid Content Document",
    },
  },
  missingImageAlt: {
    label: "Missing Image Alt",
    document: {
      blocks: [
        { alt: "", id: "image-1", source: "image.png", type: "image" },
      ],
      id: "missing-image-alt",
      title: "Missing Image Alt",
    },
  },
  duplicateBlockId: {
    label: "Duplicate Block ID",
    document: {
      blocks: [
        { id: "duplicate", text: "First paragraph.", type: "paragraph" },
        { id: "duplicate", text: "Second paragraph.", type: "paragraph" },
      ],
      id: "duplicate-block-id",
      title: "Duplicate Block IDs",
    },
  },
  invalidVideoUrl: {
    label: "Invalid Video URL",
    document: {
      blocks: [{ id: "video-1", source: "not-a-url", type: "video" }],
      id: "invalid-video-url",
      title: "Invalid Video URL",
    },
  },
  invalidHeadingHierarchy: {
    label: "Invalid Heading Hierarchy",
    document: {
      blocks: [
        { id: "heading-1", level: 2, text: "Section", type: "heading" },
        { id: "heading-2", level: 5, text: "Safely corrected", type: "heading" },
      ],
      id: "invalid-heading-hierarchy",
      title: "Heading Normalization",
    },
  },
  emptyParagraph: {
    label: "Empty Paragraph",
    document: {
      blocks: [
        { id: "empty", text: "   ", type: "paragraph" },
        { id: "content", text: "Content remains.", type: "paragraph" },
      ],
      id: "empty-paragraph",
      title: "Empty Paragraph Removal",
    },
  },
  missingBlockIds: {
    label: "Missing Block IDs",
    document: {
      blocks: [
        { text: "First generated ID.", type: "paragraph" },
        { text: "Second generated ID.", type: "paragraph" },
        { id: "paragraph-1", text: "Existing ID.", type: "paragraph" },
      ],
      id: "missing-block-ids",
      title: "Missing Block IDs",
    },
  },
  mixedValidBlocks: {
    label: "Mixed Valid Blocks",
    document: {
      blocks: [
        { id: "heading-1", level: 2, text: "Mixed content", type: "heading" },
        { id: "paragraph-1", text: "A paragraph block.", type: "paragraph" },
        { alt: "Sample image", id: "image-1", source: "image.png", type: "image" },
        {
          id: "video-1",
          source: "https://example.com/video.mp4",
          type: "video",
        },
        {
          id: "button-1",
          label: "Read more",
          targetUrl: "https://example.com",
          type: "button",
        },
      ],
      id: "mixed-valid-blocks",
      title: "Mixed Valid Blocks",
    },
  },
} as const;

export type ContentProcessingSampleKey = keyof typeof contentProcessingSamples;

export type ValidationSummary = Readonly<{
  errorCount?: number;
  infoCount?: number;
  issueCount: number;
  valid: boolean;
  warningCount?: number;
}>;

export type PlaygroundRunResult =
  | Readonly<{
      message: string;
      status: "parse-error" | "processing-error";
    }>
  | Readonly<{
      input: ContentDocument;
      outcome: "optimized" | "validation-failed";
      pipeline: ContentPipelineResult;
      status: "success";
      summary: ValidationSummary;
    }>;

export type PlaygroundState = Readonly<{
  input: string;
  result?: PlaygroundRunResult;
  selectedSample: ContentProcessingSampleKey;
}>;

export type PlaygroundAction =
  | Readonly<{ input: string; type: "edit" }>
  | Readonly<{ result: PlaygroundRunResult; type: "run" }>
  | Readonly<{ sample: ContentProcessingSampleKey; type: "select" }>
  | Readonly<{ type: "reset" }>;

export function createPlaygroundState(
  selectedSample: ContentProcessingSampleKey = "valid",
): PlaygroundState {
  return {
    input: serializeSample(selectedSample),
    selectedSample,
  };
}

export function playgroundReducer(
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState {
  switch (action.type) {
    case "edit":
      return { ...state, input: action.input, result: undefined };
    case "reset":
      return {
        ...state,
        input: serializeSample(state.selectedSample),
        result: undefined,
      };
    case "run":
      return { ...state, result: action.result };
    case "select":
      return createPlaygroundState(action.sample);
  }
}

export function runContentProcessing(
  input: string,
  pipeline: Pick<ContentPipeline, "process"> = new ContentPipeline(),
): PlaygroundRunResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Unable to parse JSON.",
      status: "parse-error",
    };
  }

  try {
    const document = parsed as ContentDocument;
    const result = pipeline.process(document);

    return {
      input: document,
      outcome: result.validation.valid ? "optimized" : "validation-failed",
      pipeline: result,
      status: "success",
      summary: summarizeValidation(result.validation),
    };
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Unable to process document.",
      status: "processing-error",
    };
  }
}

export function summarizeValidation(
  validation: ContentValidationResult,
): ValidationSummary {
  return {
    errorCount: getIssueGroupCount(validation, "errors"),
    infoCount: getIssueGroupCount(validation, "infos"),
    issueCount: validation.issues.length,
    valid: validation.valid,
    warningCount: getIssueGroupCount(validation, "warnings"),
  };
}

export function getIssueSeverity(
  issue: ContentValidationIssue,
): string | undefined {
  if (!("severity" in issue)) return undefined;
  return typeof issue.severity === "string" ? issue.severity : undefined;
}

function serializeSample(sample: ContentProcessingSampleKey): string {
  return JSON.stringify(contentProcessingSamples[sample].document, null, 2);
}

function getIssueGroupCount(
  validation: ContentValidationResult,
  group: "errors" | "infos" | "warnings",
): number | undefined {
  if (!(group in validation)) return undefined;
  const value = (validation as unknown as Record<string, unknown>)[group];
  return Array.isArray(value) ? value.length : undefined;
}
