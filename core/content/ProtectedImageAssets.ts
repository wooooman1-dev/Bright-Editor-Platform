import type { ContentDocument } from "./ContentDocument";
import type { ImageBlock } from "./blocks/ImageBlock";

export function restoreProtectedImageAssets(original: ContentDocument, candidate: ContentDocument): ContentDocument {
  const originalImagesById = new Map(
    original.blocks
      .filter((block): block is ImageBlock => block.type === "image")
      .map((block) => [block.id, block] as const),
  );
  if (!originalImagesById.size) return candidate;

  const protectedById = new Map(
    [...originalImagesById.values()]
      .filter(isAttachedImage)
      .map((block) => [block.id, block] as const),
  );
  const candidateIds = new Set(candidate.blocks.map((block) => block.id));
  const restored = candidate.blocks.map((block) => {
    if (block.type !== "image") return block;
    const protectedImage = protectedById.get(block.id);
    return protectedImage ? restoreAssetFields(protectedImage, block) : block;
  });

  for (const [id, originalImage] of originalImagesById) {
    if (candidateIds.has(id)) continue;
    const originalIndex = original.blocks.findIndex((block) => block.id === id);
    restored.splice(Math.min(Math.max(0, originalIndex), restored.length), 0, originalImage);
  }

  return Object.freeze({ ...candidate, blocks: Object.freeze(restored) });
}

function isAttachedImage(block: ImageBlock): boolean {
  return Boolean(block.source.trim());
}

function restoreAssetFields(original: ImageBlock, candidate: ImageBlock): ImageBlock {
  return Object.freeze({
    ...candidate,
    alt: original.alt,
    ...(original.assetId ? { assetId: original.assetId } : {}),
    ...(original.caption ? { caption: original.caption } : {}),
    ...(original.fileName ? { fileName: original.fileName } : {}),
    ...(original.mimeType ? { mimeType: original.mimeType } : {}),
    ...(original.prompt ? { prompt: original.prompt } : {}),
    ...(original.purpose ? { purpose: original.purpose } : {}),
    source: original.source,
    sourceType: original.sourceType,
  });
}
