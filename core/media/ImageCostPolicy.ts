import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";
import type { MediaAsset } from "./Media";
import type { ProjectMediaAsset } from "./ProjectMediaLibrary";

export const automaticAIImageLimit = 1;

const componentPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "summary",
  "warning",
]);

export function isBrightComponentPurpose(purpose: ImageBlockPurpose | undefined): boolean {
  return purpose ? componentPurposes.has(purpose) : false;
}

export function selectAutomaticImageBlock(document: ContentDocument): ImageBlock | undefined {
  const candidates = document.blocks.filter((block): block is ImageBlock => block.type === "image"
    && !block.source.trim()
    && (block.sourceType ?? "planned") === "planned"
    && !isBrightComponentPurpose(block.purpose));
  return candidates.find((block) => block.purpose === "hero") ?? candidates[0];
}

/** Removes only recommendations whose information belongs in a Bright component. Other planned images remain available for explicit user generation. */
export function applyGeneratedImageCostPolicy(document: ContentDocument): ContentDocument {
  const blocks = document.blocks.filter((block) => {
    if (block.type !== "image" || block.source.trim() || (block.sourceType ?? "planned") !== "planned") return true;
    return !isBrightComponentPurpose(block.purpose);
  });
  if (blocks.length === document.blocks.length) return document;
  return Object.freeze({
    ...document,
    blocks: Object.freeze(blocks),
    ...(document.metadata ? { metadata: Object.freeze({
      ...document.metadata,
      imageCount: blocks.filter((block) => block.type === "image").length,
    }) } : {}),
  });
}

export function findReusableProjectImage(
  assets: readonly ProjectMediaAsset[],
  block: ImageBlock,
): ProjectMediaAsset | undefined {
  const targetTerms = terms(`${block.alt} ${block.prompt ?? ""}`);
  const targetText = comparable(`${block.alt} ${block.prompt ?? ""}`);
  return assets
    .map((asset) => ({ asset, score: reuseScore(asset, block, targetText, targetTerms) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score
      || (right.asset.lastReferencedAt ?? right.asset.metadata.createdAt)
        .localeCompare(left.asset.lastReferencedAt ?? left.asset.metadata.createdAt))[0]?.asset;
}

export function generatedImageCountForContent(assets: readonly MediaAsset[] | undefined, contentId: string): number {
  return (assets ?? []).filter((asset) => asset.kind === "image"
    && asset.metadata.contentId === contentId
    && asset.metadata.sourceType === "ai_generated").length;
}

function reuseScore(
  asset: ProjectMediaAsset,
  block: ImageBlock,
  targetText: string,
  targetTerms: readonly string[],
): number {
  if (asset.kind !== "image" || !asset.source.trim()) return -1;
  const assetText = comparable(`${asset.metadata.alt ?? ""} ${asset.metadata.prompt ?? ""}`);
  if (targetText && assetText && targetText === assetText) return 100;
  const assetTerms = terms(assetText);
  const overlap = targetTerms.filter((term) => assetTerms.some((candidate) => candidate === term || candidate.includes(term) || term.includes(candidate))).length;
  const purposeMatch = Boolean(block.purpose && asset.metadata.purpose === block.purpose);
  if (overlap < 2 && !(block.purpose === "hero" && purposeMatch && overlap >= 1)) return -1;
  return overlap * 10 + (purposeMatch ? 6 : 0) + Math.min(asset.referenceCount, 5);
}

function comparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]+/gi, " ").trim();
}

function terms(value: string): string[] {
  const ignored = new Set(["이미지", "사진", "일러스트", "고품질", "블로그", "콘텐츠", "장면", "구성", "설명", "대표"]);
  return [...new Set(comparable(value).split(/\s+/).filter((term) => term.length >= 2 && !ignored.has(term)))];
}
