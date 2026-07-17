import type { ContentDocument } from "./ContentDocument";

export function ensureSeoKeywordPlacement(
  document: ContentDocument,
  primaryKeyword: string | undefined,
): ContentDocument {
  const keyword = normalizeWhitespace(primaryKeyword ?? "");
  if (!keyword) return document;

  const title = containsExactKeyword(document.title, keyword)
    ? document.title
    : `${keyword}: ${document.title}`;

  const bodyText = document.blocks
    .filter((block) => block.type === "heading" || block.type === "paragraph")
    .map((block) => block.text)
    .join("\n");

  let bodyChanged = false;
  const blocks = containsExactKeyword(bodyText, keyword)
    ? document.blocks
    : document.blocks.map((block) => {
      if (!bodyChanged && block.type === "paragraph" && block.text.trim()) {
        bodyChanged = true;
        return Object.freeze({
          ...block,
          text: `${keyword} 관련 핵심 내용을 먼저 정리하면, ${block.text.trim()}`,
        });
      }
      return block;
    });

  const currentDescription = document.metadata?.metaDescription?.trim() ?? "";
  const firstParagraph = blocks.find((block) => block.type === "paragraph")?.text ?? "";
  const metaDescription = document.metadata
    ? buildMetaDescription(currentDescription, firstParagraph, keyword)
    : currentDescription;

  const metadataChanged = Boolean(document.metadata)
    && metaDescription !== currentDescription;
  const titleChanged = title !== document.title;

  if (!titleChanged && !bodyChanged && !metadataChanged) return document;

  return Object.freeze({
    ...document,
    blocks: bodyChanged ? Object.freeze(blocks) : document.blocks,
    ...(document.metadata
      ? { metadata: Object.freeze({ ...document.metadata, metaDescription }) }
      : {}),
    title,
  });
}

function buildMetaDescription(
  currentDescription: string,
  firstParagraph: string,
  keyword: string,
): string {
  if (
    containsExactKeyword(currentDescription, keyword)
    && currentDescription.length >= 60
    && currentDescription.length <= 180
  ) {
    return currentDescription;
  }

  const source = normalizeWhitespace(currentDescription || firstParagraph);
  let candidate = normalizeWhitespace(
    `${keyword} 관련 핵심 내용과 판단 기준을 정리합니다. ${source}`,
  );

  if (candidate.length < 60) {
    candidate = normalizeWhitespace(
      `${candidate} 독자가 확인해야 할 실천 기준과 주의사항을 함께 안내합니다.`,
    );
  }

  if (candidate.length > 180) {
    candidate = `${candidate.slice(0, 179).trimEnd()}…`;
  }

  return candidate;
}

function containsExactKeyword(value: string, keyword: string): boolean {
  return normalizeWhitespace(value).toLocaleLowerCase("ko-KR")
    .includes(keyword.toLocaleLowerCase("ko-KR"));
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
