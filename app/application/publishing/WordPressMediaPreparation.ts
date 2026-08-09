import type { ContentDocument, ImageBlock } from "../../../core/content";
import type { MediaAsset } from "../../../core/media";
import {
  assertImageSignature,
  imageMimeTypeFromStorageKey,
  LocalMediaStorage,
  type SupportedImageMimeType,
} from "../media/LocalMediaStorage";

export const defaultWordPressMediaMaxBytes = 10 * 1024 * 1024;

export type WordPressLocalMediaItem = Readonly<{
  assetId: string;
  blockId: string;
  storageKey: string;
  fileName: string;
  mimeType: SupportedImageMimeType;
  bytes: Uint8Array;
  alt: string;
}>;

export type WordPressMediaReplacement = Readonly<{
  blockId: string;
  assetId: string;
  sourceUrl: string;
}>;

export interface WordPressLocalMediaReader {
  read(storageKey: string): Promise<Uint8Array>;
}

export async function prepareWordPressLocalMedia(input: Readonly<{
  document: ContentDocument;
  mediaAssets: readonly MediaAsset[];
  workspaceId: string;
  projectId: string;
  contentId: string;
  featuredImageAssetId?: string;
  reader?: WordPressLocalMediaReader;
  maxBytes?: number;
}>): Promise<readonly WordPressLocalMediaItem[]> {
  const reader = input.reader ?? new LocalMediaStorage();
  const maxBytes = positiveMaxBytes(input.maxBytes);
  const localBlocks = input.document.blocks.filter(isLocalImageBlock);
  const items: WordPressLocalMediaItem[] = [];

  for (const block of localBlocks) {
    const storageKey = localStorageKey(block.source);
    const asset = findOwnedAsset(input.mediaAssets, block, storageKey);
    assertOwnedAsset(asset, block, input);
    const mimeType = imageMimeTypeFromStorageKey(storageKey);
    if (asset.metadata.mimeType && asset.metadata.mimeType !== mimeType) {
      throw new Error("Local media MIME metadata does not match its stored file.");
    }
    let bytes: Uint8Array;
    try { bytes = await reader.read(storageKey); }
    catch { throw new Error("Local media file could not be read."); }
    if (!bytes.byteLength) throw new Error("Local media file is empty.");
    if (bytes.byteLength > maxBytes) throw new Error("Local media file exceeds the WordPress upload size limit.");
    if (asset.metadata.sizeBytes !== undefined && asset.metadata.sizeBytes !== bytes.byteLength) {
      throw new Error("Local media size metadata does not match its stored file.");
    }
    assertImageSignature(bytes, mimeType);
    const alt = block.alt.trim();
    if (!alt) throw new Error("WordPress media ALT is required.");
    items.push(Object.freeze({
      assetId: asset.id,
      blockId: block.id,
      storageKey,
      fileName: asset.metadata.fileName ?? block.fileName ?? storageKey,
      mimeType,
      bytes,
      alt,
    }));
  }

  const featuredImageAssetId = input.featuredImageAssetId?.trim();
  if (featuredImageAssetId && !items.some((item) => item.assetId === featuredImageAssetId)) {
    throw new Error("The selected WordPress Featured Image is not a verified local media asset for this Content.");
  }
  return Object.freeze(items);
}

export function applyWordPressMediaReplacements(
  document: ContentDocument,
  replacements: readonly WordPressMediaReplacement[],
): ContentDocument {
  const byBlock = new Map(replacements.map((replacement) => [replacement.blockId, replacement]));
  const requiredBlockIds = document.blocks.filter(isLocalImageBlock).map((block) => block.id);
  if (requiredBlockIds.some((blockId) => !byBlock.has(blockId))) {
    throw new Error("Every local WordPress image must have a verified external Media URL.");
  }
  return Object.freeze({
    ...document,
    blocks: Object.freeze(document.blocks.map((block) => {
      if (block.type !== "image") return block;
      const replacement = byBlock.get(block.id);
      return replacement ? Object.freeze({ ...block, source: replacement.sourceUrl }) : block;
    })),
  });
}

export function hasWordPressLocalMedia(document: ContentDocument | undefined): boolean {
  return Boolean(document?.blocks.some(isLocalImageBlock));
}

function isLocalImageBlock(block: ContentDocument["blocks"][number]): block is ImageBlock {
  return block.type === "image" && /^\/api\/media\//i.test(block.source);
}

function localStorageKey(source: string): string {
  const matched = source.match(/^\/api\/media\/([^/?#]+)$/i);
  if (!matched) throw new Error("Local media reference is invalid.");
  return matched[1];
}

function findOwnedAsset(
  assets: readonly MediaAsset[],
  block: ImageBlock,
  storageKey: string,
): MediaAsset {
  const source = `/api/media/${storageKey}`;
  const asset = block.assetId
    ? assets.find((item) => item.id === block.assetId)
    : assets.find((item) => item.source === source && item.metadata.blockId === block.id);
  if (!asset) throw new Error("Local media metadata could not be found.");
  return asset;
}

function assertOwnedAsset(
  asset: MediaAsset,
  block: ImageBlock,
  input: Readonly<{ workspaceId: string; projectId: string; contentId: string }>,
): void {
  if (asset.kind !== "image"
    || asset.source !== block.source
    || asset.metadata.workspaceId !== input.workspaceId
    || asset.metadata.projectId !== input.projectId
    || asset.metadata.contentId !== input.contentId
    || asset.metadata.blockId !== block.id) {
    throw new Error("Local media does not belong to this Workspace, Project, Content, and Image Block.");
  }
}

function positiveMaxBytes(value: number | undefined): number {
  if (value === undefined) {
    const configured = Number(process.env.BRIGHT_STUDIO_MAX_IMAGE_BYTES);
    return Number.isInteger(configured) && configured > 0 ? configured : defaultWordPressMediaMaxBytes;
  }
  if (!Number.isInteger(value) || value < 1) throw new Error("WordPress media size limit is invalid.");
  return value;
}
