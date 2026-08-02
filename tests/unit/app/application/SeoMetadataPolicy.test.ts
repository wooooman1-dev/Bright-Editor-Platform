import { describe, expect, it } from "vitest";

import { preserveCanonicalSeoMetadata } from "../../../../app/application/SeoMetadataPolicy";
import type { ContentDocument } from "../../../../core/content";

function document(
  seoTitle: string | undefined,
  metaDescription: string | undefined,
  title = "일반 글 제목",
): ContentDocument {
  return {
    id: "content-1",
    title,
    blocks: [{ id: "p-1", type: "paragraph", text: "본문입니다." }],
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-02T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 1,
      ...(seoTitle !== undefined ? { seoTitle } : {}),
      ...(metaDescription !== undefined ? { metaDescription } : {}),
    },
  };
}

describe("preserveCanonicalSeoMetadata", () => {
  it("preserves the current SEO title and meta description when the Review omits them", () => {
    const current = document("기존 SEO 제목", "기존 메타 설명");
    const candidate = document(undefined, undefined, "검토 후 일반 제목");

    expect(preserveCanonicalSeoMetadata(current, candidate).metadata).toMatchObject({
      seoTitle: "기존 SEO 제목",
      metaDescription: "기존 메타 설명",
    });
  });

  it("preserves the current values when the Review returns blank strings", () => {
    const current = document("기존 SEO 제목", "기존 메타 설명");
    const candidate = document("   ", " ");

    expect(preserveCanonicalSeoMetadata(current, candidate).metadata).toMatchObject({
      seoTitle: "기존 SEO 제목",
      metaDescription: "기존 메타 설명",
    });
  });

  it("accepts explicit nonblank SEO replacements", () => {
    const current = document("기존 SEO 제목", "기존 메타 설명");
    const candidate = document("새 SEO 제목", "새 메타 설명");

    expect(preserveCanonicalSeoMetadata(current, candidate).metadata).toMatchObject({
      seoTitle: "새 SEO 제목",
      metaDescription: "새 메타 설명",
    });
  });
});