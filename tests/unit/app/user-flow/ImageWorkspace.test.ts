import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const imageEditorSource = readFileSync(join(process.cwd(), "app/user-flow/ImageBlockEditor.tsx"), "utf8");
const documentEditorSource = readFileSync(join(process.cwd(), "app/user-flow/ContentDocumentEditor.tsx"), "utf8");
const mediaRouteSource = readFileSync(join(process.cwd(), "app/api/media/route.ts"), "utf8");
const imageProviderSource = readFileSync(join(process.cwd(), "app/application/media/OpenAIImageProvider.ts"), "utf8");
const generationSource = readFileSync(join(process.cwd(), "app/application/EditorialGenerationStrategy.ts"), "utf8");
const imageBlockSource = readFileSync(join(process.cwd(), "core/content/blocks/ImageBlock.ts"), "utf8");
const mediaLibrarySource = readFileSync(join(process.cwd(), "core/media/ProjectMediaLibrary.ts"), "utf8");

describe("Bright Studio image workspace", () => {
  it("offers independent prompt, upload, generation, and copy actions for each image block", () => {
    expect(imageEditorSource).toContain("이미지 별도 제작용 프롬프트");
    expect(imageEditorSource).toContain("파일 불러오기");
    expect(imageEditorSource).toContain("AI 생성하기");
    expect(imageEditorSource).toContain("프롬프트 복사");
    expect(imageEditorSource).toContain('accept="image/png,image/jpeg,image/webp"');
  });

  it("allows a new independent image workspace to be added to the canonical document", () => {
    expect(documentEditorSource).toContain("이미지 추가");
    expect(documentEditorSource).toContain("sourceType: \"planned\"");
    expect(documentEditorSource).toContain("<ImageBlockEditor");
  });

  it("keeps prompt, purpose, origin, and media reference in the canonical image block", () => {
    expect(imageBlockSource).toContain("assetId?: string");
    expect(imageBlockSource).toContain("prompt?: string");
    expect(imageBlockSource).toContain("purpose?: ImageBlockPurpose");
    expect(imageBlockSource).toContain("sourceType?: ImageBlockSourceType");
  });

  it("validates image ownership and supported upload formats on the server", () => {
    expect(mediaRouteSource).toContain("assertOwnedImageBlock(contentId, blockId)");
    expect(mediaRouteSource).toContain("imageTypeFromMimeType(file.type)");
    expect(mediaRouteSource).toContain("BRIGHT_STUDIO_MAX_IMAGE_BYTES");
  });

  it("persists Project media metadata atomically and removes a new local file when metadata persistence fails", () => {
    expect(mediaRouteSource).toContain("studioStore.update<UserData>");
    expect(mediaRouteSource).toContain("mediaMetadata: Object.freeze(mediaMetadata)");
    expect(mediaRouteSource).toContain("await storage.remove(stored.storageKey)");
  });

  it("lists and reuses Project images without creating duplicate files", () => {
    expect(imageEditorSource).toContain("Project 이미지 재사용");
    expect(imageEditorSource).toContain("파일 복사본은 만들지 않습니다");
    expect(imageEditorSource).toContain("referenceCount");
    expect(mediaRouteSource).toContain("buildProjectMediaLibrary");
    expect(mediaLibrarySource).toContain("referenceCount: references.length");
  });

  it("uses the interchangeable image provider boundary for OpenAI image generation", () => {
    expect(imageProviderSource).toContain("implements ImageProvider");
    expect(imageProviderSource).toContain('process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2"');
    expect(imageProviderSource).toContain('fetch("https://api.openai.com/v1/images/generations"');
  });

  it("creates standalone production prompts in the existing single editorial generation call", () => {
    expect(generationSource).toContain("Every image block must include");
    expect(generationSource).toContain("standalone production prompt");
    expect(generationSource).toContain("ensureDistinctImagePrompts");
    expect(generationSource).toContain('prompt: `${subject}. 한국 블로그 본문에 적합한 고품질 이미지');
  });
});
