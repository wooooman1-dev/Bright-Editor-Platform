import { describe, expect, it } from "vitest";

import { applyResolvedTistoryMedia, assertRemoteTistoryMediaUrl, createTistoryMediaUploadPlan } from "../../../../apps/tistory/publishing/TistoryMediaUploadPlan";
import type { ContentDocument } from "../../../../core/content";

const localSource = "/api/media/123e4567-e89b-12d3-a456-426614174000.png";

function documentWithImages(): ContentDocument {
  return {
    id: "content-1",
    title: "이미지 발행 준비",
    blocks: [
      { id: "heading-1", type: "heading", level: 2, text: "이미지" },
      { id: "image-local", type: "image", source: localSource, alt: "로컬 이미지" },
      { id: "image-remote", type: "image", source: "https://example.com/existing.webp", alt: "기존 외부 이미지" },
    ],
  };
}

describe("TistoryMediaUploadPlan", () => {
  it("replaces only local Bright Studio media with deterministic placeholders", () => {
    const original = documentWithImages();
    const plan = createTistoryMediaUploadPlan(original);
    const local = plan.document.blocks.find((block) => block.id === "image-local");
    const remote = plan.document.blocks.find((block) => block.id === "image-remote");

    expect(plan.items).toEqual([
      expect.objectContaining({
        alt: "로컬 이미지",
        blockId: "image-local",
        storageKey: "123e4567-e89b-12d3-a456-426614174000.png",
      }),
    ]);
    expect(local).toMatchObject({ source: plan.items[0]?.placeholderUrl });
    expect(remote).toMatchObject({ source: "https://example.com/existing.webp" });
    expect(original.blocks.find((block) => block.id === "image-local")).toMatchObject({ source: localSource });
  });

  it("replaces every placeholder with a trusted Tistory CDN URL", () => {
    const plan = createTistoryMediaUploadPlan(documentWithImages());
    const placeholder = plan.items[0]?.placeholderUrl;
    expect(placeholder).toBeTruthy();
    const html = `<figure><img src="${placeholder}" alt="로컬 이미지"></figure>`;
    const remoteUrl = "https://blog.kakaocdn.net/dn/example/image.png";

    expect(applyResolvedTistoryMedia(html, [{ blockId: "image-local", placeholderUrl: placeholder!, remoteUrl }])).toContain(remoteUrl);
  });

  it("rejects incomplete replacements and untrusted media hosts", () => {
    const plan = createTistoryMediaUploadPlan(documentWithImages());
    const placeholder = plan.items[0]?.placeholderUrl ?? "";
    expect(() => applyResolvedTistoryMedia(`<img src="${placeholder}">`, [])).toThrow(/did not resolve every local image/i);
    expect(() => assertRemoteTistoryMediaUrl("http://blog.kakaocdn.net/image.png")).toThrow(/HTTPS/i);
    expect(() => assertRemoteTistoryMediaUrl("https://example.com/image.png")).toThrow(/not trusted/i);
  });
});
