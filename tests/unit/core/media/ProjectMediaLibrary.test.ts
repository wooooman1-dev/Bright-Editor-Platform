import { describe, expect, it } from "vitest";

import { buildProjectMediaLibrary, type MediaAsset, type ProjectMediaContent } from "../../../../core/media";

const asset: MediaAsset = Object.freeze({
  id: "asset-1",
  kind: "image",
  metadata: Object.freeze({
    alt: "공통 이미지",
    contentId: "content-1",
    createdAt: "2026-07-18T01:00:00.000Z",
    fileName: "shared.png",
    mimeType: "image/png",
    projectId: "project-1",
    prompt: "공통 프롬프트",
    sourceType: "upload",
    workspaceId: "workspace-1",
  }),
  source: "/api/media/shared.png",
});

const contents: readonly ProjectMediaContent[] = Object.freeze([
  {
    id: "content-1",
    projectId: "project-1",
    title: "첫 글",
    updatedAt: "2026-07-18T02:00:00.000Z",
    document: {
      id: "content-1",
      title: "첫 글",
      blocks: [{ id: "image-1", type: "image", source: asset.source, alt: "첫 ALT", assetId: asset.id, sourceType: "upload" }],
    },
  },
  {
    id: "content-2",
    projectId: "project-1",
    title: "둘째 글",
    updatedAt: "2026-07-18T03:00:00.000Z",
    document: {
      id: "content-2",
      title: "둘째 글",
      blocks: [{ id: "image-2", type: "image", source: asset.source, alt: "둘째 ALT", assetId: asset.id, sourceType: "upload" }],
    },
  },
  {
    id: "content-other",
    projectId: "project-2",
    title: "다른 프로젝트",
    updatedAt: "2026-07-18T04:00:00.000Z",
    document: {
      id: "content-other",
      title: "다른 프로젝트",
      blocks: [{ id: "image-other", type: "image", source: "/api/media/other.png", alt: "다른 이미지", assetId: "asset-other", sourceType: "upload" }],
    },
  },
]);

describe("buildProjectMediaLibrary", () => {
  it("groups canonical references for one persisted project asset", () => {
    const library = buildProjectMediaLibrary({ assets: [asset], contents, projectId: "project-1" });

    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({
      id: "asset-1",
      referenceCount: 2,
      lastReferencedAt: "2026-07-18T03:00:00.000Z",
      source: "/api/media/shared.png",
    });
    expect(library[0].references.map((reference) => reference.contentId)).toEqual(["content-1", "content-2"]);
  });

  it("keeps a detached persisted asset available for reuse", () => {
    const detached: MediaAsset = {
      ...asset,
      id: "asset-detached",
      source: "/api/media/detached.webp",
      metadata: { ...asset.metadata, createdAt: "2026-07-18T05:00:00.000Z", fileName: "detached.webp", mimeType: "image/webp" },
    };

    const library = buildProjectMediaLibrary({ assets: [asset, detached], contents, projectId: "project-1" });
    expect(library[0]).toMatchObject({ id: "asset-detached", referenceCount: 0 });
    expect(library[0].references).toEqual([]);
  });

  it("recovers legacy canonical images that have no persisted metadata", () => {
    const legacyContents: readonly ProjectMediaContent[] = [{
      id: "legacy-content",
      projectId: "project-1",
      title: "이전 원고",
      updatedAt: "2026-07-18T06:00:00.000Z",
      document: {
        id: "legacy-content",
        title: "이전 원고",
        blocks: [{ id: "legacy-image", type: "image", source: "/api/media/legacy.jpeg", alt: "이전 이미지", fileName: "legacy.jpeg", mimeType: "image/jpeg", sourceType: "upload" }],
      },
    }];

    const library = buildProjectMediaLibrary({ contents: legacyContents, projectId: "project-1" });
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({
      id: "legacy:/api/media/legacy.jpeg",
      referenceCount: 1,
      source: "/api/media/legacy.jpeg",
    });
  });

  it("keeps an untyped legacy HTTPS image classified as external", () => {
    const externalContents: readonly ProjectMediaContent[] = [{
      id: "external-content",
      projectId: "project-1",
      title: "외부 이미지 원고",
      updatedAt: "2026-07-18T07:00:00.000Z",
      document: {
        id: "external-content",
        title: "외부 이미지 원고",
        blocks: [{ id: "external-image", type: "image", source: "https://images.example.com/photo.jpg", alt: "외부 이미지" }],
      },
    }];

    const library = buildProjectMediaLibrary({ contents: externalContents, projectId: "project-1" });
    expect(library[0].metadata.sourceType).toBe("external");
  });

  it("excludes assets and contents owned by another project", () => {
    const otherAsset: MediaAsset = { ...asset, id: "asset-other", source: "/api/media/other.png", metadata: { ...asset.metadata, projectId: "project-2" } };
    const library = buildProjectMediaLibrary({ assets: [asset, otherAsset], contents, projectId: "project-1" });
    expect(library.map((item) => item.id)).toEqual(["asset-1"]);
  });
});
