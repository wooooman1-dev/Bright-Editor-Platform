import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { ImageBlock } from "../../../core/content";
import {
  automaticAIImageLimit,
  buildProjectMediaLibrary,
  generatedImageCountForContent,
  isBrightComponentPurpose,
  isProjectImageReusableForBlock,
  selectAutomaticImageBlock,
  type ImageGenerationQuality,
  type ImageGenerationSize,
  type MediaAsset,
} from "../../../core/media";
import { studioStore } from "../../application/studio-store";
import { LocalMediaStorage, assertImageSignature, imageTypeFromMimeType } from "../../application/media/LocalMediaStorage";
import { OpenAIImageProvider } from "../../application/media/OpenAIImageProvider";
import type { UserData } from "../../user-flow/user-data";

const collection = "application";
const stateId = "user-data";
const defaultMaxUploadBytes = 10 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const contentId = requiredText(searchParams.get("contentId"), "Content is required.");
    const blockId = text(searchParams.get("blockId"));
    const data = await studioStore.get<UserData>(collection, stateId);
    const content = data?.contents.find((item) => item.id === contentId);
    if (!data || !content) throw new Error("프로젝트 이미지 목록을 불러올 콘텐츠를 찾지 못했습니다.");
    const block = blockId
      ? content.document?.blocks.find((item): item is ImageBlock => item.id === blockId && item.type === "image")
      : undefined;
    if (blockId && !block) throw new Error("이미지 블록을 찾지 못했습니다.");
    const projectAssets = buildProjectMediaLibrary({
      assets: data.mediaMetadata,
      contents: data.contents,
      projectId: content.projectId,
      publishingRecords: data.publishingRecords,
    });
    const assets = block
      ? projectAssets.filter((asset) => isProjectImageReusableForBlock(asset, block))
      : projectAssets;
    return NextResponse.json({
      assets,
      projectId: content.projectId,
      reuseAllowed: true,
      reusePolicy: block?.purpose === "hero" ? "unused_hero" : "body_only",
    });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: statusCode(error) });
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) return await uploadImage(request);
    return await generateImage(request);
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: statusCode(error) });
  }
}

async function uploadImage(request: Request) {
  const form = await request.formData();
  const contentId = requiredText(form.get("contentId"), "Content is required.");
  const blockId = requiredText(form.get("blockId"), "Image block is required.");
  const owner = await resolveOwnedImageBlock(contentId, blockId);

  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("불러올 이미지 파일을 선택해 주세요.");
  const maxBytes = readPositiveInteger(process.env.BRIGHT_STUDIO_MAX_IMAGE_BYTES, defaultMaxUploadBytes);
  if (!file.size) throw new Error("빈 이미지 파일은 불러올 수 없습니다.");
  if (file.size > maxBytes) throw new Error(`이미지 파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`);

  const imageType = imageTypeFromMimeType(file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertImageSignature(bytes, imageType.mimeType);
  const storage = new LocalMediaStorage();
  const stored = await storage.save(bytes, imageType.extension);
  const asset = createAsset({
    alt: text(form.get("alt")),
    blockId,
    contentId,
    fileName: safeFileName(file.name),
    mimeType: imageType.mimeType,
    projectId: owner.projectId,
    prompt: text(form.get("prompt")),
    purpose: owner.block.purpose,
    sizeBytes: bytes.byteLength,
    source: stored.source,
    sourceType: "upload",
    workspaceId: owner.workspaceId,
  });
  try {
    await persistMediaAsset(asset);
  } catch (error) {
    await storage.remove(stored.storageKey);
    throw error;
  }
  return NextResponse.json({ asset });
}

async function generateImage(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  if (body.action !== undefined && body.action !== "generate") throw new Error("지원하지 않는 이미지 작업입니다.");
  const contentId = requiredText(body.contentId, "Content is required.");
  const blockId = requiredText(body.blockId, "Image block is required.");
  const prompt = requiredText(body.prompt, "이미지 프롬프트를 입력해 주세요.");
  const mode = body.mode === "manual" ? "manual" : "automatic";
  const owner = await resolveOwnedImageBlock(contentId, blockId);

  const manualBrightReplacement = mode === "manual" && isBrightComponentPurpose(owner.block.purpose);
  if (mode === "automatic" && owner.block.purpose !== "hero") {
    throw new Error("자동 AI 이미지는 원고의 대표이미지 한 개에만 허용됩니다.");
  }
  if (owner.block.purpose !== "hero" && !manualBrightReplacement) {
    throw new Error("일반 본문 이미지는 비용 없는 Project 이미지 재사용 또는 파일 업로드를 사용합니다. 무료 Bright 카드는 사용자가 명시적으로 요청한 수동 AI 교체만 허용됩니다.");
  }

  if (mode === "automatic") {
    const selected = selectAutomaticImageBlock(owner.content.document!);
    if (!selected || selected.id !== blockId) {
      throw new Error("자동 AI 이미지는 원고의 대표이미지 한 개에만 허용됩니다.");
    }
    const generatedCount = generatedImageCountForContent(owner.data.mediaMetadata, contentId);
    if (generatedCount >= automaticAIImageLimit) {
      throw new Error(`자동 AI 이미지는 원고당 최대 ${automaticAIImageLimit}장입니다. 대표이미지를 다시 만들려면 편집기에서 직접 생성해 주세요.`);
    }
  }

  console.info("[image-cost-policy] calling OpenAI image provider", {
    blockId,
    contentId,
    mode,
    projectId: owner.projectId,
    purpose: owner.block.purpose ?? null,
  });
  const generated = await new OpenAIImageProvider().generate({
    prompt,
    quality: normalizeQuality(body.quality),
    size: normalizeSize(body.size),
  });
  assertImageSignature(generated.bytes, generated.mimeType);
  const storage = new LocalMediaStorage();
  const stored = await storage.save(generated.bytes, generated.fileExtension);
  const asset = createAsset({
    alt: text(body.alt),
    blockId,
    contentId,
    fileName: generatedImageFileName(owner.block.purpose, contentId, generated.fileExtension),
    mimeType: generated.mimeType,
    model: generated.model,
    projectId: owner.projectId,
    prompt,
    purpose: owner.block.purpose,
    sizeBytes: generated.bytes.byteLength,
    source: stored.source,
    sourceType: "ai_generated",
    workspaceId: owner.workspaceId,
  });
  try {
    await persistMediaAsset(asset);
  } catch (error) {
    await storage.remove(stored.storageKey);
    throw error;
  }
  return NextResponse.json({ asset, generation: { model: generated.model, quality: generated.quality, size: generated.size }, reused: false });
}

type OwnedImageBlock = Readonly<{
  block: ImageBlock;
  content: UserData["contents"][number];
  data: UserData;
  projectId: string;
  workspaceId: string;
}>;

async function resolveOwnedImageBlock(contentId: string, blockId: string): Promise<OwnedImageBlock> {
  const data = await studioStore.get<UserData>(collection, stateId);
  const content = data?.contents.find((item) => item.id === contentId);
  if (!data || !content?.document) throw new Error("이미지를 연결할 콘텐츠를 찾지 못했습니다.");
  const block = content.document.blocks.find((item): item is ImageBlock => item.id === blockId && item.type === "image");
  if (!block) throw new Error("이미지 블록을 찾지 못했습니다.");
  const workspaceId = content.workspaceId ?? data.workspace?.id;
  if (!workspaceId) throw new Error("이미지 소유 작업 공간을 확인하지 못했습니다.");
  return Object.freeze({ block, content, data, projectId: content.projectId, workspaceId });
}

async function persistMediaAsset(asset: MediaAsset): Promise<void> {
  await studioStore.update<UserData>(collection, stateId, (current) => {
    if (!current) throw new Error("이미지 메타데이터를 저장할 작업 공간을 찾지 못했습니다.");
    const content = current.contents.find((item) => item.id === asset.metadata.contentId);
    const workspaceId = content?.workspaceId ?? current.workspace?.id;
    if (!content || content.projectId !== asset.metadata.projectId || workspaceId !== asset.metadata.workspaceId) {
      throw new Error("이미지 소유 정보가 현재 콘텐츠와 일치하지 않습니다.");
    }
    const mediaMetadata = [...(current.mediaMetadata ?? []).filter((item) => item.id !== asset.id && item.source !== asset.source), asset];
    return Object.freeze({ ...current, mediaMetadata: Object.freeze(mediaMetadata) });
  });
}

function createAsset(input: Readonly<{
  alt: string;
  blockId: string;
  contentId: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  model?: string;
  projectId: string;
  prompt: string;
  purpose?: ImageBlock["purpose"];
  sizeBytes: number;
  source: string;
  sourceType: "upload" | "ai_generated";
  workspaceId: string;
}>): MediaAsset {
  return Object.freeze({
    id: randomUUID(),
    kind: "image",
    metadata: Object.freeze({
      alt: input.alt,
      blockId: input.blockId,
      contentId: input.contentId,
      createdAt: new Date().toISOString(),
      fileName: input.fileName,
      mimeType: input.mimeType,
      ...(input.model ? { model: input.model } : {}),
      projectId: input.projectId,
      prompt: input.prompt,
      ...(input.purpose ? { purpose: input.purpose } : {}),
      sizeBytes: input.sizeBytes,
      sourceType: input.sourceType,
      workspaceId: input.workspaceId,
    }),
    source: input.source,
  });
}

function normalizeSize(value: unknown): ImageGenerationSize {
  return value === "1024x1536" || value === "1536x1024" ? value : "1024x1024";
}

function normalizeQuality(value: unknown): ImageGenerationQuality {
  return value === "low" || value === "high" ? value : "medium";
}

function requiredText(value: unknown, error: string): string {
  const result = text(value);
  if (!result) throw new Error(error);
  return result;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 생성 이미지의 파일명.
 *
 * `ai-${Date.now()}` 는 워드프레스에 올라가면 그대로 URL 이 된다
 * (/wp-content/uploads/2026/08/ai-1787843165123.png). 미디어 라이브러리와
 * 이미지 주소에 AI 로 만들었다는 표시가 남고, 파일명이 설명하는 바도 없다.
 *
 * 한글 파일명은 지금 구조에서 쓸 수 없다. WordPressMediaAdapter 의
 * safeFileName 이 Content-Disposition 헤더에 넣기 위해 ASCII 밖 문자를 전부
 * `-` 로 바꾸므로, 한글 이름은 `-------.png` 가 되어 올라간다. 그래서 ASCII
 * 범위 안에서 용도와 날짜와 Content 를 담는다.
 */
function generatedImageFileName(
  purpose: string | undefined,
  contentId: string,
  extension: string,
): string {
  const role = (purpose ?? "image").replace(/[^a-z0-9]+/gi, "").toLowerCase() || "image";
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = contentId.split("-").filter(Boolean).at(-1) ?? "image";
  return `${role}-${day}-${suffix}.${extension}`;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 160) || "image";
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function statusCode(error: unknown): number {
  const value = message(error);
  if (/OPENAI_API_KEY|required to generate images/i.test(value)) return 503;
  if (/OpenAI image request failed|timed out/i.test(value)) return 502;
  if (/자동 AI 이미지|대표이미지|본문 이미지|Bright HTML\/SVG 컴포넌트/.test(value)) return 409;
  return 400;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "이미지 작업을 완료하지 못했습니다.";
}
