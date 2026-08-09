import { analyzeLongFormDocument, type ContentDocument, type LongFormDiagnostic } from "../../../core/content";
import { editorialRevisionId } from "../../../core/quality";

export type ApprovalGenerationTrace = Readonly<{
  version: "1.0";
  capturedAt: string;
  capturedRevisionId: string;
  passages: readonly Readonly<{
    blockId: string;
    text: string;
  }>[];
}>;

type TraceableDiagnostic = LongFormDiagnostic & Readonly<{
  approvalGenerationTrace?: ApprovalGenerationTrace;
}>;

/**
 * Persists only approval-risk passages from the Generation result. The trace is
 * stored inside generationDiagnostic, which is excluded from AI review prompts,
 * so it adds no prompt tokens and cannot be rewritten by the Review response.
 */
export function withApprovalGenerationTrace(
  document: ContentDocument,
  previousDocument?: ContentDocument,
): ContentDocument {
  const metadata = document.metadata;
  const profileId = metadata?.approvalPolicy?.profileId;
  if (!metadata || profileId !== "wordpress_life_economy_v1") return document;

  const existing = traceFrom(document) ?? (previousDocument ? traceFrom(previousDocument) : undefined);
  const trace = existing ?? createTrace(document);
  const diagnostic = metadata.generationDiagnostic
    ?? analyzeLongFormDocument(document, metadata.qualityTarget);
  const traceable = diagnostic as TraceableDiagnostic;
  if (traceable.approvalGenerationTrace === trace) return document;

  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...metadata,
      generationDiagnostic: Object.freeze({
        ...diagnostic,
        approvalGenerationTrace: trace,
      }) as LongFormDiagnostic,
    }),
  });
}

export function approvalGenerationTrace(
  document: ContentDocument,
): ApprovalGenerationTrace | undefined {
  return traceFrom(document);
}

/**
 * Classifies an exact final passage using the preserved pre-Review Generation
 * passages. This is deterministic and does not call AI.
 */
export function classifyApprovalPassageOrigin(
  document: ContentDocument,
  passage: string,
): "generation" | "quality_review" | "unknown" {
  const normalizedPassage = normalize(passage);
  if (!normalizedPassage || !documentPassages(document).some((item) => normalize(item.text).includes(normalizedPassage))) {
    return "unknown";
  }
  const trace = traceFrom(document);
  if (!trace) return "unknown";
  return trace.passages.some((item) => normalize(item.text).includes(normalizedPassage))
    ? "generation"
    : "quality_review";
}

function createTrace(document: ContentDocument): ApprovalGenerationTrace {
  return Object.freeze({
    version: "1.0",
    capturedAt: document.metadata?.updatedAt ?? new Date(0).toISOString(),
    capturedRevisionId: editorialRevisionId(document),
    passages: Object.freeze(documentPassages(document)
      .filter((item) => approvalRiskPattern.test(item.text))
      .map((item) => Object.freeze(item))),
  });
}

function traceFrom(document: ContentDocument): ApprovalGenerationTrace | undefined {
  const diagnostic = document.metadata?.generationDiagnostic as TraceableDiagnostic | undefined;
  const trace = diagnostic?.approvalGenerationTrace;
  return trace?.version === "1.0" && Array.isArray(trace.passages) ? trace : undefined;
}

function documentPassages(document: ContentDocument): readonly Readonly<{ blockId: string; text: string }>[] {
  return Object.freeze(document.blocks.flatMap((block) => {
    if (block.type === "heading" || block.type === "paragraph") {
      return [{ blockId: block.id, text: block.text }];
    }
    if (block.type === "list") {
      return [{ blockId: block.id, text: block.items.join("\n") }];
    }
    if (block.type === "table") {
      return [{
        blockId: block.id,
        text: [block.caption ?? "", ...block.headers, ...block.rows.flat()].join("\n"),
      }];
    }
    return [];
  }));
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

const approvalRiskPattern = /정보\s*기준일|(?:Claim\s*)?최종\s*검토일|출처\s*확인일|방문판매|계속거래|자동(?:결제|이체)|정기결제|구독|계약서|위약금|환급/iu;
