import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { MediaAsset, ImageGenerationQuality, ImageGenerationSize } from "../../../core/media";
import { studioStore } from "../../application/studio-store";
import { LocalMediaStorage, imageTypeFromMimeType } from "../../application/media/LocalMediaStorage";
import { OpenAIImageProvider } from "../../application/media/OpenAIImageProvider";
import type { UserData } from "../../user-flow/user-data";

const collection = "application";
const stateId = "user-data";
const defaultMaxUploadBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) return uploadImage(request);
    return generateImage(request);
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: statusCode(error) });
  }
}

async function uploadImage(request: Request) {
  const form = await request.formData();
  const contentId = requiredText(form.get("contentId"), "Content is required.");
  const blockId = requiredText(form.get("blockId"), "Image block is required.");
  await assertOwnedImageBlock(contentId, blockId);

  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("불러올 이미지 파일을 선택해 주세요.");
  const maxBytes = readPositiveInteger(process.env.BRIGHT_STUDIO_MAX_IMAGE_BYTES, defaultMaxUploadBytes);
  if (!file.size) throw new Error("빈 이미지 파일은 불러올 수 없습니다.");
  if (file.size > maxBytes) throw new Error(`이미지 파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`);

  const imageType = imageTypeFromMimeType(file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await new LocalMediaStorage().save(bytes, imageType.extension);
  const asset = createAsset({
    alt: text(form.get("alt")),
    blockId,
    contentId,
    fileName: safeFileName(file.name),
    mimeType: imageType.mimeType,
    prompt: text(form.get("prompt")),
    sizeBytes: bytes.byteLength,
    source: stored.source,
    sourceType: "upload",
  });
  return NextResponse.json({ asset });
}

async function generateImage(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const contentId = requiredText(body.contentId, "Content is required.");
  const blockId = requiredText(body.blockId, "Image block is required.");
  const prompt = requiredText(body.prompt, "이미지 프롬프트를 입력해 주세요.");
  await assertOwnedImageBlock(contentId, blockId);

  const generated = await new OpenAIImageProvider().generate({
    prompt,
    quality: normalizeQuality(body.quality),
    size: normalizeSize(body.size),
  });
  const stored = await new LocalMediaStorage().save(generated.bytes, generated.fileExtension);
  const asset = createAsset({
    alt: text(body.alt),
    blockId,
    contentId,
    fileName: `ai-${Date.now()}.${generated.fileExtension}`,
    mimeType: generated.mimeType,
    model: generated.model,
    prompt,
    sizeBytes: generated.bytes.byteLength,
    source: stored.source,
    sourceType: "ai_generated",
  });
  return NextResponse.json({ asset, generation: { model: generated.model, quality: generated.quality, size: generated.size } });
}

async function assertOwnedImageBlock(contentId: string, blockId: string): Promise<void> {
  const data = await studioStore.get<UserData>(collection, stateId);
  const content = data?.contents.find((item) => item.id === contentId);
  if (!content?.document) throw new Error("이미지를 연결할 콘텐츠를 찾지 못했습니다.");
  if (!content.document.blocks.some((block) => block.id === blockId && block.type === "image")) throw new Error("이미지 블록을 찾지 못했습니다.");
}

function createAsset(input: Readonly<{
  alt: string;
  blockId: string;
  contentId: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  model?: string;
  prompt: string;
  sizeBytes: number;
  source: string;
  sourceType: "upload" | "ai_generated";
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
      prompt: input.prompt,
      sizeBytes: input.sizeBytes,
      sourceType: input.sourceType,
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
  return 400;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "이미지 작업을 완료하지 못했습니다.";
}
