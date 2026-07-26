import type { ContentDocument } from "../content";

export type MediaKind = "image" | "video" | "embed";
export type MediaSourceType = "upload" | "ai_generated" | "external";
export type ImagePurpose = "hero" | "comparison" | "checklist" | "infographic" | "summary" | "warning" | "inline";
export type MediaMetadata = Readonly<{
  alt?: string;
  blockId?: string;
  contentId?: string;
  createdAt: string;
  fileName?: string;
  height?: number;
  mimeType?: string;
  model?: string;
  projectId?: string;
  prompt?: string;
  purpose?: ImagePurpose;
  sizeBytes?: number;
  sourceType?: MediaSourceType;
  width?: number;
  workspaceId?: string;
}>;
export type MediaAsset = Readonly<{
  id: string;
  kind: MediaKind;
  metadata: MediaMetadata;
  source: string;
}>;
export type ImagePlan = Readonly<{
  alt: string;
  placement: number;
  prompt?: string;
  purpose: ImagePurpose;
}>;
export type ThumbnailPlan = Readonly<{ alt: string; prompt?: string; purpose: ImagePurpose }>;

export type ImageGenerationSize = "1024x1024" | "1024x1536" | "1536x1024";
export type ImageGenerationQuality = "low" | "medium" | "high";
export type ImageGenerationRequest = Readonly<{
  prompt: string;
  quality?: ImageGenerationQuality;
  size?: ImageGenerationSize;
}>;
export type ImageGenerationResult = Readonly<{
  bytes: Uint8Array;
  fileExtension: "png" | "jpeg" | "webp";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  model: string;
  quality: ImageGenerationQuality;
  size: ImageGenerationSize;
}>;

export interface ImageStrategy { plan(document: ContentDocument): readonly ImagePlan[]; }
export interface ThumbnailStrategy { plan(document: ContentDocument): ThumbnailPlan | undefined; }
export interface AltGenerator { generate(context: Readonly<{ title: string; purpose: ImagePurpose }>): Promise<string>; }
export interface ImageProvider { generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>; }
/** @deprecated Use ImageProvider for image generation implementations. */
export interface FutureImageProvider { generate(plan: ImagePlan): Promise<MediaAsset>; }

export interface MediaLibrary {
  find(id: string): Promise<MediaAsset | undefined>;
  list(): Promise<readonly MediaAsset[]>;
  save(asset: MediaAsset): Promise<void>;
}

export class InMemoryMediaLibrary implements MediaLibrary {
  private readonly assets = new Map<string, MediaAsset>();
  async find(id: string) { return this.assets.get(id); }
  async list() { return [...this.assets.values()]; }
  async save(asset: MediaAsset) { this.assets.set(asset.id, asset); }
}

export class MediaManager {
  constructor(private readonly library: MediaLibrary) {}
  async add(asset: MediaAsset): Promise<void> {
    if (!asset.source.trim()) throw new Error("Media source is required.");
    if (asset.kind === "image" && !asset.metadata.alt?.trim()) throw new Error("Image ALT text is required.");
    await this.library.save(Object.freeze(asset));
  }
}

export type CtaBlock = Readonly<{ id: string; label: string; targetUrl: string; type: "cta" }>;
export type EmbedBlock = Readonly<{ id: string; source: string; title: string; type: "embed" }>;
