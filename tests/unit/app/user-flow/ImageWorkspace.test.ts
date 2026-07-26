import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const imageEditorSource = readFileSync(join(process.cwd(), "app/user-flow/ImageBlockEditor.tsx"), "utf8");
const documentEditorSource = readFileSync(join(process.cwd(), "app/user-flow/ContentDocumentEditor.tsx"), "utf8");
const mediaRouteSource = readFileSync(join(process.cwd(), "app/api/media/route.ts"), "utf8");
const imageProviderSource = readFileSync(join(process.cwd(), "app/application/media/OpenAIImageProvider.ts"), "utf8");
const openAIProviderSource = readFileSync(join(process.cwd(), "app/application/OpenAIProvider.ts"), "utf8");
const generationSource = readFileSync(join(process.cwd(), "app/application/EditorialGenerationStrategy.ts"), "utf8");
const imageBlockSource = readFileSync(join(process.cwd(), "core/content/blocks/ImageBlock.ts"), "utf8");
const mediaLibrarySource = readFileSync(join(process.cwd(), "core/media/ProjectMediaLibrary.ts"), "utf8");
const imageCostPolicySource = readFileSync(join(process.cwd(), "core/media/ImageCostPolicy.ts"), "utf8");
const freeVisualSource = readFileSync(join(process.cwd(), "core/media/BrightBodyVisuals.ts"), "utf8");

 describe("Bright Studio image workspace", () => {
  it("offers prompt, upload, and copy actions for every image block", () => {
    expect(imageEditorSource).toContain("이미지 별도 제작용 프롬프트");
    expect(imageEditorSource).toContain("파일 불러오기");
    expect(imageEditorSource).toContain("프롬프트 복사");
    expect(imageEditorSource).toContain('accept="image/png,image/jpeg,image/webp"');
  });

  it("keeps automatic AI generation hero-only while offering explicit paid replacement for every free card", () => {
    expect(imageEditorSource).toContain("대표이미지 AI 생성");
    expect(imageEditorSource).toContain("대표이미지 중복 방지");
    expect(imageEditorSource).toContain("미사용 대표이미지 재사용");
    expect(imageEditorSource).toContain("Tistory 임시저장에 보내지 않았고 현재 다른 원고에도 연결되지 않은 대표이미지만 표시");
    expect(imageEditorSource).toContain("AI 이미지로 교체 · 유료");
    expect(documentEditorSource).toContain("Project 이미지·파일·AI로 교체");
    expect(mediaRouteSource).toContain('owner.block.purpose !== "hero"');
    expect(openAIProviderSource).toContain('purpose: { type: "string", enum: ["hero"] }');
    expect(imageCostPolicySource).toContain('block.purpose === "hero"');
    expect(imageCostPolicySource).toContain('"infographic"');
  });

  it("shows up to two zero-cost body visual cards in the existing editor", () => {
    expect(documentEditorSource).toContain("ensureFreeBodyVisuals");
    expect(documentEditorSource).toContain("FreeBodyVisualCard");
    expect(documentEditorSource).toContain('data-free-visual="true"');
    expect(documentEditorSource).toContain("Project 이미지·파일·AI로 교체");
    expect(freeVisualSource).toContain("const bodyVisualLimit = 2");
    expect(freeVisualSource).toContain("renderBrightBodyVisualHtml");
  });

  it("allows a new independent image workspace to be added to the canonical document", () => {
    expect(documentEditorSource).toContain("이미지 추가");
    expect(documentEditorSource).toContain('sourceType: "planned"');
    expect(documentEditorSource).toContain("<ImageBlockEditor");
  });

  it("keeps prompt, purpose, origin, and media reference in the canonical image block", () => {
    expect(imageBlockSource).toContain("assetId?: string");
    expect(imageBlockSource).toContain("prompt?: string");
    expect(imageBlockSource).toContain("purpose?: ImageBlockPurpose");
    expect(imageBlockSource).toContain("sourceType?: ImageBlockSourceType");
  });

  it("validates image ownership and supported upload formats on the server", () => {
    expect(mediaRouteSource).toContain("resolveOwnedImageBlock(contentId, blockId)");
    expect(mediaRouteSource).toContain('item.id === blockId && item.type === "image"');
    expect(mediaRouteSource).toContain("imageTypeFromMimeType(file.type)");
    expect(mediaRouteSource).toContain("BRIGHT_STUDIO_MAX_IMAGE_BYTES");
  });

  it("persists Project media metadata atomically and removes a new local file when metadata persistence fails", () => {
    expect(mediaRouteSource).toContain("studioStore.update<UserData>");
    expect(mediaRouteSource).toContain("mediaMetadata: Object.freeze(mediaMetadata)");
    expect(mediaRouteSource).toContain("await storage.remove(stored.storageKey)");
  });

  it("lists body-reusable images and unsent representative images without creating duplicate files", () => {
    expect(imageEditorSource).toContain("Project 이미지 재사용");
    expect(imageEditorSource).toContain("대표이미지 사용 이력이 없는 자산만 표시");
    expect(imageEditorSource).toContain("파일 복사본은 만들지 않습니다");
    expect(imageEditorSource).toContain("referenceCount");
    expect(mediaRouteSource).toContain("isProjectImageReusableForBlock");
    expect(mediaLibrarySource).toContain("purpose: block.purpose");
    expect(mediaLibrarySource).toContain("referenceCount: references.length");
  });

  it("uses the interchangeable image provider boundary for OpenAI hero generation", () => {
    expect(imageProviderSource).toContain("implements ImageProvider");
    expect(imageProviderSource).toContain('process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2"');
    expect(imageProviderSource).toContain('fetch("https://api.openai.com/v1/images/generations"');
  });

  it("creates at most one optional unique hero prompt in the existing editorial generation call", () => {
    expect(generationSource).toContain("Return no more than one source-empty representative hero image recommendation block");
    expect(generationSource).toContain("must never be satisfied by reusing another post's Project image");
    expect(generationSource).toContain("Do not return source-empty inline or infographic image blocks");
    expect(generationSource).toContain("standalone production prompt");
    expect(generationSource).toContain("applyGeneratedImageCostPolicy");
    expect(generationSource).toContain("ensureDistinctImagePrompts");
  });
});
