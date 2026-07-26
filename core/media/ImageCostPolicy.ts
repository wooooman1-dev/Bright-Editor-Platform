import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";
import type { MediaAsset } from "./Media";
import type { ProjectMediaAsset } from "./ProjectMediaLibrary";

export const automaticAIImageLimit = 1;

const componentPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "infographic",
  "summary",
  "warning",
]);

export function isBrightComponentPurpose(purpose: ImageBlockPurpose | undefined): boolean {
  return purpose ? componentPurposes.has(purpose) : false;
}

/** Automatic paid generation is reserved for one unique representative image. */
export function selectAutomaticImageBlock(document: ContentDocument): ImageBlock | undefined {
  return document.blocks.find((block): block is ImageBlock => block.type === "image"
    && block.purpose === "hero"
    && !block.source.trim()
    && (block.sourceType ?? "planned") === "planned");
}

/**
 * Keeps a source-empty hero recommendation only. Body visual information must use
 * a table/Bright component, Project media, or a user upload instead of paid AI generation.
 * Existing connected images are always preserved.
 */
export function applyGeneratedImageCostPolicy(document: ContentDocument): ContentDocument {
  const blocks = document.blocks.filter((block) => {
    if (block.type !== "image" || block.source.trim() || (block.sourceType ?? "planned") !== "planned") return true;
    return block.purpose === "hero";
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

/**
 * A representative asset can be selected manually only while it has never been sent
 * to a platform draft. Automatic generation never calls this policy for hero reuse.
 * Body reuse continues to exclude every asset created or referenced as a hero.
 */
export function isProjectImageReusableForBlock(asset: ProjectMediaAsset, block: ImageBlock): boolean {
  if (asset.kind !== "image" || !asset.source.trim()) return false;
  const heroReferences = asset.references.filter((reference) => reference.purpose === "hero");
  if (block.purpose === "hero") {
    const isHeroAsset = asset.metadata.purpose === "hero" || heroReferences.length > 0;
    return isHeroAsset && !heroReferences.some((reference) => reference.sentToDraft === true);
  }
  if (asset.metadata.purpose === "hero") return false;
  return heroReferences.length === 0;
}

export function findReusableProjectImage(
  assets: readonly ProjectMediaAsset[],
  block: ImageBlock,
): ProjectMediaAsset | undefined {
  if (block.purpose === "hero") return undefined;
  const targetTerms = terms(`${block.alt} ${block.prompt ?? ""}`);
  const targetText = comparable(`${block.alt} ${block.prompt ?? ""}`);
  return assets
    .filter((asset) => isProjectImageReusableForBlock(asset, block))
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
  const assetText = comparable(`${asset.metadata.alt ?? ""} ${asset.metadata.prompt ?? ""}`);
  if (targetText && assetText && targetText === assetText) return 100;
  const assetTerms = terms(assetText);
  const overlap = targetTerms.filter((term) => assetTerms.some((candidate) => candidate === term || candidate.includes(term) || term.includes(candidate))).length;
  const purposeMatch = Boolean(block.purpose && asset.metadata.purpose === block.purpose);
  if (overlap < 2) return -1;
  return overlap * 10 + (purposeMatch ? 6 : 0) + Math.min(asset.referenceCount, 5);
}

function comparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]+/gi, " ").trim();
}

function terms(value: string): string[] {
  const ignored = new Set(["이미지", "사진", "일러스트", "고품질", "블로그", "콘텐츠", "장면", "구성", "설명", "대표"]);
  return [...new Set(comparable(value).split(/\s+/).filter((term) => term.length >= 2 && !ignored.has(term)))];
}
