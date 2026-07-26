import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";
import type { MediaAsset, MediaSourceType } from "./Media";

export type ProjectMediaContent = Readonly<{
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
  status?: string;
  document?: ContentDocument;
}>;

export type ProjectMediaPublishingRecord = Readonly<{
  contentId: string;
  status: "saved" | "partially_verified" | "failed";
}>;

export type ProjectMediaReference = Readonly<{
  blockId: string;
  contentId: string;
  contentTitle: string;
  purpose?: ImageBlockPurpose;
  sentToDraft?: boolean;
  updatedAt: string;
}>;

export type ProjectMediaAsset = MediaAsset & Readonly<{
  lastReferencedAt?: string;
  originSentToDraft?: boolean;
  referenceCount: number;
  references: readonly ProjectMediaReference[];
}>;

export function buildProjectMediaLibrary(input: Readonly<{
  assets?: readonly MediaAsset[];
  contents: readonly ProjectMediaContent[];
  projectId: string;
  publishingRecords?: readonly ProjectMediaPublishingRecord[];
}>): readonly ProjectMediaAsset[] {
  const contents = input.contents.filter((content) => content.projectId === input.projectId);
  const sentContentIds = new Set([
    ...contents.filter((content) => content.status === "draft_saved").map((content) => content.id),
    ...(input.publishingRecords ?? [])
      .filter((record) => record.status === "saved" || record.status === "partially_verified")
      .map((record) => record.contentId),
  ]);
  const known = new Map<string, MediaAsset>();

  for (const asset of input.assets ?? []) {
    if (asset.kind !== "image" || asset.metadata.projectId !== input.projectId || !asset.source.trim()) continue;
    known.set(asset.id, asset);
  }

  for (const content of contents) {
    for (const block of imageBlocks(content.document)) {
      if (!block.source.trim()) continue;
      const existing = [...known.values()].find((asset) => asset.id === block.assetId || asset.source === block.source);
      if (existing) continue;
      const id = block.assetId?.trim() || `legacy:${block.source}`;
      known.set(id, Object.freeze({
        id,
        kind: "image",
        metadata: Object.freeze({
          alt: block.alt,
          blockId: block.id,
          contentId: content.id,
          createdAt: content.updatedAt,
          fileName: block.fileName,
          mimeType: block.mimeType,
          projectId: input.projectId,
          prompt: block.prompt,
          purpose: block.purpose,
          sourceType: legacySourceType(block),
        }),
        source: block.source,
      }));
    }
  }

  return Object.freeze([...known.values()].map((asset) => {
    const matchingBlocks = contents.flatMap((content) => imageBlocks(content.document)
      .filter((block) => block.assetId === asset.id || block.source === asset.source)
      .map((block) => ({ block, content })));
    const references = matchingBlocks.map(({ block, content }) => Object.freeze({
      blockId: block.id,
      contentId: content.id,
      contentTitle: content.title,
      ...(block.purpose ? { purpose: block.purpose } : {}),
      sentToDraft: sentContentIds.has(content.id),
      updatedAt: content.updatedAt,
    }));
    const lastReferencedAt = references.map((reference) => reference.updatedAt).sort().at(-1);
    const referencedPurpose = matchingBlocks.find(({ block }) => block.purpose)?.block.purpose;
    const metadata = asset.metadata.purpose || !referencedPurpose
      ? asset.metadata
      : Object.freeze({ ...asset.metadata, purpose: referencedPurpose });
    return Object.freeze({
      ...asset,
      metadata,
      ...(lastReferencedAt ? { lastReferencedAt } : {}),
      originSentToDraft: asset.metadata.contentId ? sentContentIds.has(asset.metadata.contentId) : false,
      referenceCount: references.length,
      references: Object.freeze(references),
    });
  }).sort((left, right) => {
    const leftDate = left.lastReferencedAt ?? left.metadata.createdAt;
    const rightDate = right.lastReferencedAt ?? right.metadata.createdAt;
    return rightDate.localeCompare(leftDate) || left.id.localeCompare(right.id);
  }));
}

function imageBlocks(document?: ContentDocument): readonly ImageBlock[] {
  return document?.blocks.filter((block): block is ImageBlock => block.type === "image") ?? [];
}

function legacySourceType(block: ImageBlock): MediaSourceType {
  if (block.sourceType === "ai_generated") return "ai_generated";
  if (block.sourceType === "external") return "external";
  return block.source.startsWith("/api/media/") ? "upload" : "external";
}
