import { describe, expect, it } from "vitest";

import {
  legacyWordPressContentRevisionId,
  projectWordPressBodyDocument,
  resolveWordPressFeaturedImageAssetId,
  resolveWordPressSeoMetadata,
  wordpressBodyMediaUrls,
  wordpressDraftExecutionRevisionId,
} from "../../../../../app/application/publishing/WordPressDraftProjection";
import type { UserContent } from "../../../../../app/user-flow/user-data";
import type { ContentDocument } from "../../../../../core/content";
import { contentRevisionId } from "../../../../../core/quality";

const NOW = "2026-08-02T00:00:00.000Z";

describe("WordPress Draft projection", () => {
  it("resolves one local Hero automatically and removes it only from the WordPress body projection", () => {
    const document = imageDocument();
    const featuredImageAssetId = resolveWordPressFeaturedImageAssetId(document);
    const projected = projectWordPressBodyDocument(document, featuredImageAssetId);

    expect(featuredImageAssetId).toBe("asset-hero");
    expect(projected.blocks).toEqual([
      { id: "paragraph", type: "paragraph", text: "Body" },
      { id: "inline", type: "image", source: "https://example.com/inline.png", alt: "Inline", assetId: "asset-inline", purpose: "inline" },
    ]);
    expect(document.blocks).toHaveLength(3);
    expect(wordpressBodyMediaUrls(projected)).toEqual(["https://example.com/inline.png"]);
  });

  it("keeps every body image when there is no explicit selection and no local Hero", () => {
    const document: ContentDocument = {
      ...imageDocument(),
      blocks: imageDocument().blocks.map((block) =>
        block.type === "image" && block.purpose === "hero"
          ? { ...block, purpose: "inline" as const }
          : block),
    };
    expect(resolveWordPressFeaturedImageAssetId(document)).toBeUndefined();
    expect(projectWordPressBodyDocument(document)).toBe(document);
  });

  it("rejects an explicit Featured Image that does not map to exactly one Image Block", () => {
    expect(() => resolveWordPressFeaturedImageAssetId(imageDocument(), "missing")).toThrow(
      "must match exactly one Image Block",
    );
  });

  it("rejects multiple automatic local Hero candidates instead of guessing", () => {
    const document: ContentDocument = {
      ...imageDocument(),
      blocks: [
        ...imageDocument().blocks,
        { id: "hero-2", type: "image", source: "/api/media/hero-2.png", alt: "Hero 2", assetId: "asset-hero-2", purpose: "hero" },
      ],
    };
    expect(() => resolveWordPressFeaturedImageAssetId(document)).toThrow(
      "multiple local Hero images",
    );
  });

  it("maps canonical SEO fields without another AI call", () => {
    const document: ContentDocument = {
      id: "document",
      title: "고정지출 줄이는 방법",
      blocks: [{ id: "paragraph", type: "paragraph", text: "Body" }],
      metadata: {
        buttonCount: 0,
        createdAt: NOW,
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: NOW,
        version: 1,
        videoCount: 0,
        wordCount: 1,
        seoTitle: "고정지출 줄이는 방법 4단계",
        metaDescription: "고정지출을 점검하고 줄이는 순서를 정리했습니다.",
      },
    };
    const content = {
      id: "content",
      projectId: "project",
      primaryKeyword: "고정지출 줄이는 방법",
      title: document.title,
      body: "",
      status: "ready",
      updatedAt: NOW,
      document,
    } as UserContent & Readonly<{ document: ContentDocument }>;

    expect(resolveWordPressSeoMetadata(content)).toEqual({
      focusKeyphrase: "고정지출 줄이는 방법",
      seoTitle: "고정지출 줄이는 방법 4단계",
      metaDescription: "고정지출을 점검하고 줄이는 순서를 정리했습니다.",
    });
  });

  it("uses the article title only as a legacy SEO-title fallback", () => {
    const document: ContentDocument = {
      id: "document",
      title: "Legacy title",
      blocks: [{ id: "paragraph", type: "paragraph", text: "Body" }],
      metadata: {
        buttonCount: 0,
        createdAt: NOW,
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: NOW,
        version: 1,
        videoCount: 0,
        wordCount: 1,
        metaDescription: "Legacy meta description",
      },
    };
    const content = {
      id: "content",
      projectId: "project",
      primaryKeyword: "legacy keyword",
      title: document.title,
      body: "",
      status: "ready",
      updatedAt: NOW,
      document,
    } as UserContent & Readonly<{ document: ContentDocument }>;

    expect(resolveWordPressSeoMetadata(content)?.seoTitle).toBe("Legacy title");
  });
});

function imageDocument(): ContentDocument {
  return {
    id: "document",
    title: "Title",
    blocks: [
      { id: "paragraph", type: "paragraph", text: "Body" },
      { id: "hero", type: "image", source: "/api/media/hero.png", alt: "Hero", assetId: "asset-hero", purpose: "hero" },
      { id: "inline", type: "image", source: "https://example.com/inline.png", alt: "Inline", assetId: "asset-inline", purpose: "inline" },
    ],
  };
}

describe("WordPress Draft execution Revision", () => {
  it("is stable for category order but changes for every WordPress payload input", () => {
    const base = executionContent();
    const original = wordpressDraftExecutionRevisionId(base, "wordpress-1");
    const reordered = wordpressDraftExecutionRevisionId({
      ...base,
      publishingPreparation: {
        wordpress: {
          ...base.publishingPreparation!.wordpress!,
          categoryIds: ["9", "12"],
        },
      },
    }, "wordpress-1");

    expect(reordered).toBe(original);
    expect(wordpressDraftExecutionRevisionId({
      ...base,
      primaryKeyword: "변경된 핵심 키워드",
    }, "wordpress-1")).not.toBe(original);
    expect(wordpressDraftExecutionRevisionId({
      ...base,
      document: {
        ...base.document,
        metadata: { ...base.document.metadata!, seoTitle: "변경된 SEO 제목" },
      },
    }, "wordpress-1")).not.toBe(original);
    expect(wordpressDraftExecutionRevisionId({
      ...base,
      document: {
        ...base.document,
        metadata: { ...base.document.metadata!, metaDescription: "변경된 메타 설명" },
      },
    }, "wordpress-1")).not.toBe(original);
    expect(wordpressDraftExecutionRevisionId({
      ...base,
      publishingPreparation: {
        wordpress: {
          ...base.publishingPreparation!.wordpress!,
          categoryIds: ["15"],
        },
      },
    }, "wordpress-1")).not.toBe(original);
    expect(wordpressDraftExecutionRevisionId({
      ...base,
      publishingPreparation: {
        wordpress: {
          ...base.publishingPreparation!.wordpress!,
          featuredImageAssetId: "asset-inline",
        },
      },
    }, "wordpress-1")).not.toBe(original);
    expect(wordpressDraftExecutionRevisionId(base, "wordpress-1", "custom-slug"))
      .not.toBe(original);
  });
});

function executionContent(): UserContent & Readonly<{ document: ContentDocument }> {
  const document: ContentDocument = {
    id: "content-identity",
    title: "고정지출 줄이는 방법",
    metadata: {
      buttonCount: 0,
      createdAt: NOW,
      generator: "test",
      imageCount: 2,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: NOW,
      version: 1,
      videoCount: 0,
      wordCount: 10,
      seoTitle: "고정지출 줄이는 방법 4단계",
      metaDescription: "고정지출을 점검하고 줄이는 순서를 안내합니다.",
    },
    blocks: [
      { id: "p", type: "paragraph", text: "Body" },
      { id: "hero", type: "image", source: "/api/media/hero", alt: "Hero", assetId: "asset-hero", purpose: "hero" },
      { id: "inline", type: "image", source: "/api/media/inline", alt: "Inline", assetId: "asset-inline", purpose: "inline" },
    ],
  };
  return {
    id: "content-identity",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: document.title,
    body: "",
    status: "ready",
    updatedAt: NOW,
    primaryKeyword: "고정지출 줄이는 방법",
    document,
    publishingPreparation: {
      wordpress: {
        publishingAccountId: "wordpress-1",
        categoryIds: ["12", "9"],
        categoryNames: ["생활경제", "절약"],
        featuredImageAssetId: "asset-hero",
        updatedAt: NOW,
      },
    },
  };
}

describe("legacy WordPress content Revision", () => {
  it("keeps the publishing:v1 Revision stable when SEO metadata is added", () => {
    const base: ContentDocument = {
      id: "legacy-revision",
      title: "기존 워드프레스 글",
      blocks: [{ id: "p", type: "paragraph", text: "동일한 본문입니다." }],
    };
    const withSeo: ContentDocument = {
      ...base,
      metadata: {
        buttonCount: 0,
        createdAt: NOW,
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: NOW,
        version: 1,
        videoCount: 0,
        wordCount: 3,
        seoTitle: "기존 워드프레스 글 SEO 제목",
        metaDescription: "기존 글의 메타 설명입니다.",
      },
    };

    expect(legacyWordPressContentRevisionId(withSeo))
      .toBe(legacyWordPressContentRevisionId(base));
    expect(contentRevisionId(withSeo))
      .not.toBe(legacyWordPressContentRevisionId(withSeo));
  });
});
