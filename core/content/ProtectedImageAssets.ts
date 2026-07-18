import type { ContentBlock } from "./ContentBlock";
import type { ContentDocument } from "./ContentDocument";
import type { ImageBlock } from "./blocks/ImageBlock";

export function restoreProtectedImageAssets(original: ContentDocument, candidate: ContentDocument): ContentDocument {
  const protectedById = new Map(
    original.blocks
      .filter(isProtectedImage)
      .map((block) => [block.id, block] as const),
  );
  if (!protectedById.size) return candidate;

  const candidateIds = new Set(candidate.blocks.map((block) => block.id));
  const restored = candidate.blocks.map((block) => {
    if (block.type !== "image") return block;
    const protectedImage = protectedById.get(block.id);
    return protectedImage ? restoreAssetFields(protectedImage, block) : block;
  });

  for (const [id, protectedImage] of protectedById) {
    if (candidateIds.has(id)) continue;
    const originalIndex = original.blocks.findIndex((block) => block.id === id);
    restored.splice(Math.min(Math.max(0, originalIndex), restored.length), 0, protectedImage);
  }

  return Object.freeze({ ...candidate, blocks: Object.freeze(restored) });
}

function isProtectedImage(block: ContentBlock): block is ImageBlock {
  return block.type === "image" && Boolean(block.source.trim()) && (block.sourceType === "upload" || block.sourceType === "ai_generated" || Boolean(block.assetId));
}

function restoreAssetFields(original: ImageBlock, candidate: ImageBlock): ImageBlock {
  return Object.freeze({
    ...candidate,
    alt: candidate.alt.trim() ? candidate.alt : original.alt,
    ...(original.assetId ? { assetId: original.assetId } : {}),
    ...(original.fileName ? { fileName: original.fileName } : {}),
    ...(original.mimeType ? { mimeType: original.mimeType } : {}),
    ...(original.prompt ? { prompt: original.prompt } : {}),
    ...(original.purpose ? { purpose: original.purpose } : {}),
    source: original.source,
    sourceType: original.sourceType,
  });
}
