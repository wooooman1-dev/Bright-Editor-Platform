import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";

export type PreviousImagePromptContext = Readonly<{
  alt: string;
  blockId: string;
  purpose: ImageBlockPurpose;
  scene: string;
}>;

export type ImagePromptContext = Readonly<{
  block: ImageBlock;
  blockIndex: number;
  imageIndex: number;
  previousImages: readonly PreviousImagePromptContext[];
  primaryKeyword?: string;
  primaryParagraph: string;
  purpose: ImageBlockPurpose;
  sectionHeading: string;
  sectionText: string;
  title: string;
}>;

export function collectImagePromptContexts(document: ContentDocument, primaryKeyword?: string): readonly ImagePromptContext[] {
  const imageEntries = document.blocks.flatMap((block, blockIndex) => block.type === "image" ? [{ block, blockIndex }] : []);
  return Object.freeze(imageEntries.map(({ block, blockIndex }, imageIndex) => {
    const headingIndex = nearestPreviousHeadingIndex(document, blockIndex);
    const nextHeadingIndex = document.blocks.findIndex((candidate, index) => index > blockIndex && candidate.type === "heading");
    const sectionStart = headingIndex >= 0 ? headingIndex + 1 : 0;
    const sectionEnd = nextHeadingIndex >= 0 ? nextHeadingIndex : document.blocks.length;
    const paragraphs = document.blocks
      .slice(sectionStart, sectionEnd)
      .flatMap((candidate, offset) => candidate.type === "paragraph" && candidate.text.trim() ? [{ distance: Math.abs(sectionStart + offset - blockIndex), text: candidate.text }] : []);
    const primaryParagraph = [...paragraphs].sort((left, right) => left.distance - right.distance)[0]?.text ?? "";
    const previousImages = imageEntries.slice(0, imageIndex).map(({ block: previous }) => Object.freeze({
      alt: previous.alt.trim(),
      blockId: previous.id,
      purpose: previous.purpose ?? "inline",
      scene: excerpt(previous.alt.trim() || previous.prompt?.trim() || "이전 이미지 장면", 100),
    }));

    return Object.freeze({
      block,
      blockIndex,
      imageIndex,
      previousImages: Object.freeze(previousImages),
      ...(primaryKeyword?.trim() ? { primaryKeyword: primaryKeyword.trim() } : {}),
      primaryParagraph: excerpt(primaryParagraph, 220),
      purpose: block.purpose ?? inferPurpose(headingIndex, imageIndex),
      sectionHeading: headingIndex >= 0 && document.blocks[headingIndex]?.type === "heading" ? document.blocks[headingIndex].text.trim() : "",
      sectionText: excerpt(paragraphs.map((item) => item.text).join(" "), 460),
      title: document.title.trim(),
    });
  }));
}

function nearestPreviousHeadingIndex(document: ContentDocument, blockIndex: number): number {
  for (let index = blockIndex - 1; index >= 0; index -= 1) {
    if (document.blocks[index]?.type === "heading") return index;
  }
  return -1;
}

function inferPurpose(headingIndex: number, imageIndex: number): ImageBlockPurpose {
  return headingIndex < 0 && imageIndex === 0 ? "hero" : "inline";
}

export function excerpt(value: string, maximumLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) return normalized;
  const clipped = normalized.slice(0, maximumLength + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary >= Math.floor(maximumLength * 0.65) ? boundary : maximumLength).trim()}…`;
}
