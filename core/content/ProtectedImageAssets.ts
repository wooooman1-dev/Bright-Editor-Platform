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

/**
 * generate 액션의 첫 생성 결과는 이미지 블록에 id 가 없다(모델이 id 를 안
 * 준다) — parseBlock 이 위치 기반 id(block-N)를 새로 붙이므로, 이전 원고의
 * 대표 이미지 id(예: hero-image)와 절대 일치하지 않는다. 그래서
 * restoreProtectedImageAssets 를 그대로 쓰면 id 매칭이 항상 실패해서 24~28행의
 * "candidate 에 없는 원본 이미지를 그 자리에 다시 끼운다" 경로가 발동하고,
 * 결과는 대표 이미지가 두 장이 되는 것이다(2026-09-04 실측: generate 만 이
 * 함수를 안 부르는 이유가 이것이었다).
 *
 * 대표 이미지는 문서당 하나뿐이라는 성질을 그대로 이용한다 — id 가 아니라
 * 역할(purpose: "hero")로 짝짓고, 새 블록을 추가하지 않고 그 자리에서
 * 자산 필드만 옮긴다.
 */
export function restoreProtectedHeroImage(original: ContentDocument, candidate: ContentDocument): ContentDocument {
  const originalHero = original.blocks.find(
    (block): block is ImageBlock => block.type === "image" && block.purpose === "hero" && isAttachedImage(block),
  );
  if (!originalHero) return candidate;
  const candidateHeroIndex = candidate.blocks.findIndex((block) => block.type === "image" && block.purpose === "hero");
  if (candidateHeroIndex === -1) return candidate;
  const blocks = [...candidate.blocks];
  blocks[candidateHeroIndex] = restoreAssetFields(originalHero, blocks[candidateHeroIndex] as ImageBlock);
  return Object.freeze({ ...candidate, blocks: Object.freeze(blocks) });
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
