import type { ContentDocument } from "./ContentDocument";

export type EditorialMarkupIssueCode =
  | "markdown_link"
  | "markdown_image"
  | "malformed_markdown_link"
  | "html_tag"
  | "code_fence";

export type EditorialMarkupIssue = Readonly<{
  code: EditorialMarkupIssueCode;
  location: string;
}>;

export class EditorialMarkupIntegrityError extends Error {
  constructor(readonly issues: readonly EditorialMarkupIssue[]) {
    super(`독자용 원고에 지원하지 않는 마크업이 남아 있습니다: ${[...new Set(issues.map((issue) => issue.code))].join(", ")}.`);
    this.name = "EditorialMarkupIntegrityError";
  }
}

const markdownImagePattern = /!\[[^\]\n]*\]\([^)\n]*\)/iu;
const markdownLinkPattern = /(?<!!)\[[^\]\n]+\]\([^)\n]+\)/u;
const markdownLinkReplacementPattern = /(?<!!)\[([^\]\n]+)\]\([^)\n]+\)/gu;
const malformedMarkdownLinkPattern = /!?\[[^\]\n]*\]\([^)\n]*(?:$|\n)/mu;
const htmlTagPattern = /<\/?[a-z][^>]*>/iu;
const codeFencePattern = /```/u;

export function normalizeEditorialMarkupText(value: string): string {
  if (!value) return value;
  const normalized = value.replace(markdownLinkReplacementPattern, (_match, label: string) => label.trim());
  const issues = analyzeText(normalized, "text");
  if (issues.length) throw new EditorialMarkupIntegrityError(issues);
  return normalized;
}

export function normalizeEditorialMarkupDocument(document: ContentDocument): ContentDocument {
  const metadata = document.metadata
    ? Object.freeze({
        ...document.metadata,
        ...(document.metadata.metaDescription !== undefined
          ? { metaDescription: normalizeEditorialMarkupText(document.metadata.metaDescription) }
          : {}),
        ...(document.metadata.primarySearchIntent !== undefined
          ? { primarySearchIntent: normalizeEditorialMarkupText(document.metadata.primarySearchIntent) }
          : {}),
        ...(document.metadata.secondaryIntent !== undefined
          ? { secondaryIntent: normalizeEditorialMarkupText(document.metadata.secondaryIntent) }
          : {}),
        ...(document.metadata.secondaryKeywords !== undefined
          ? { secondaryKeywords: Object.freeze(document.metadata.secondaryKeywords.map(normalizeEditorialMarkupText)) }
          : {}),
        ...(document.metadata.relatedTerms !== undefined
          ? { relatedTerms: Object.freeze(document.metadata.relatedTerms.map(normalizeEditorialMarkupText)) }
          : {}),
        ...(document.metadata.tags !== undefined
          ? { tags: Object.freeze(document.metadata.tags.map(normalizeEditorialMarkupText)) }
          : {}),
      })
    : undefined;

  const blocks = document.blocks.map((block) => {
    if (block.type === "heading" || block.type === "paragraph") {
      return Object.freeze({ ...block, text: normalizeEditorialMarkupText(block.text) });
    }
    if (block.type === "table") {
      return Object.freeze({
        ...block,
        ...(block.caption !== undefined ? { caption: normalizeEditorialMarkupText(block.caption) } : {}),
        headers: Object.freeze(block.headers.map(normalizeEditorialMarkupText)),
        rows: Object.freeze(block.rows.map((row) => Object.freeze(row.map(normalizeEditorialMarkupText)))),
      });
    }
    if (block.type === "image") {
      return Object.freeze({
        ...block,
        alt: normalizeEditorialMarkupText(block.alt),
        ...(block.caption !== undefined ? { caption: normalizeEditorialMarkupText(block.caption) } : {}),
      });
    }
    if (block.type === "button") {
      return Object.freeze({ ...block, label: normalizeEditorialMarkupText(block.label) });
    }
    return block;
  });

  return Object.freeze({
    ...document,
    title: normalizeEditorialMarkupText(document.title),
    blocks: Object.freeze(blocks),
    ...(metadata ? { metadata } : {}),
  });
}

export function analyzeEditorialMarkupIntegrity(document: ContentDocument): readonly EditorialMarkupIssue[] {
  const values: Array<readonly [string, string]> = [
    ["title", document.title],
    ["metadata.metaDescription", document.metadata?.metaDescription ?? ""],
    ["metadata.primarySearchIntent", document.metadata?.primarySearchIntent ?? ""],
    ["metadata.secondaryIntent", document.metadata?.secondaryIntent ?? ""],
    ...(document.metadata?.secondaryKeywords ?? []).map((value, index) => [`metadata.secondaryKeywords[${index}]`, value] as const),
    ...(document.metadata?.relatedTerms ?? []).map((value, index) => [`metadata.relatedTerms[${index}]`, value] as const),
    ...(document.metadata?.tags ?? []).map((value, index) => [`metadata.tags[${index}]`, value] as const),
  ];

  for (const [index, block] of document.blocks.entries()) {
    if (block.type === "heading" || block.type === "paragraph") values.push([`blocks[${index}].text`, block.text]);
    if (block.type === "table") {
      values.push([`blocks[${index}].caption`, block.caption ?? ""]);
      block.headers.forEach((value, cell) => values.push([`blocks[${index}].headers[${cell}]`, value]));
      block.rows.forEach((row, rowIndex) => row.forEach((value, cell) => values.push([`blocks[${index}].rows[${rowIndex}][${cell}]`, value])));
    }
    if (block.type === "image") {
      values.push([`blocks[${index}].alt`, block.alt]);
      values.push([`blocks[${index}].caption`, block.caption ?? ""]);
    }
    if (block.type === "button") values.push([`blocks[${index}].label`, block.label]);
  }

  return Object.freeze(values.flatMap(([location, value]) => analyzeText(value, location)));
}

function analyzeText(value: string, location: string): readonly EditorialMarkupIssue[] {
  if (!value) return Object.freeze([]);
  const issues: EditorialMarkupIssue[] = [];
  if (markdownImagePattern.test(value)) issues.push(Object.freeze({ code: "markdown_image", location }));
  if (markdownLinkPattern.test(value)) issues.push(Object.freeze({ code: "markdown_link", location }));
  if (malformedMarkdownLinkPattern.test(value)) issues.push(Object.freeze({ code: "malformed_markdown_link", location }));
  if (htmlTagPattern.test(value)) issues.push(Object.freeze({ code: "html_tag", location }));
  if (codeFencePattern.test(value)) issues.push(Object.freeze({ code: "code_fence", location }));
  return Object.freeze(issues);
}
