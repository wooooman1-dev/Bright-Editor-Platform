import { describe, expect, it, vi } from "vitest";

import {
  applyWordPressMediaReplacements,
  prepareWordPressLocalMedia,
} from "../../../../../app/application/publishing/WordPressMediaPreparation";
import type { ContentDocument } from "../../../../../core/content";
import type { MediaAsset } from "../../../../../core/media";

const SOURCE = "/api/media/00000000-0000-0000-0000-000000000001.png";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe("WordPress local media preparation", () => {
  it("validates owned media and derives a replacement document without mutating canonical Content", async () => {
    const document = imageDocument();
    const plan = await prepareWordPressLocalMedia({
      document,
      mediaAssets: [mediaAsset()],
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      featuredImageAssetId: "asset-1",
      reader: { read: vi.fn(async () => PNG) },
    });
    const rendered = applyWordPressMediaReplacements(document, [{
      blockId: "image-1",
      assetId: "asset-1",
      sourceUrl: "https://example.com/uploads/image.png",
    }]);

    expect(plan).toMatchObject([{ assetId: "asset-1", blockId: "image-1", mimeType: "image/png", alt: "Canonical ALT" }]);
    expect(document.blocks[1]).toMatchObject({ source: SOURCE });
    expect(rendered.blocks[1]).toMatchObject({ source: "https://example.com/uploads/image.png" });
    expect(rendered).not.toBe(document);
  });

  it.each([
    ["Workspace", { workspaceId: "workspace-other" }],
    ["Project", { projectId: "project-other" }],
    ["Content", { contentId: "content-other" }],
    ["Image Block", { blockId: "image-other" }],
  ])("blocks a local MediaAsset owned by another %s", async (_label, metadataChange) => {
    await expect(prepareWordPressLocalMedia({
      document: imageDocument(),
      mediaAssets: [mediaAsset(metadataChange)],
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      reader: { read: vi.fn(async () => PNG) },
    })).rejects.toThrow("does not belong");
  });

  it("blocks missing files, unsupported signatures, and oversized bytes", async () => {
    const input = {
      document: imageDocument(),
      mediaAssets: [mediaAsset()],
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
    } as const;
    await expect(prepareWordPressLocalMedia({
      ...input,
      reader: { read: vi.fn(async () => { throw new Error("private path"); }) },
    })).rejects.toThrow("could not be read");
    await expect(prepareWordPressLocalMedia({
      ...input,
      mediaAssets: [mediaAsset({ sizeBytes: 3 })],
      reader: { read: vi.fn(async () => new Uint8Array([1, 2, 3])) },
    })).rejects.toThrow();
    await expect(prepareWordPressLocalMedia({
      ...input,
      mediaAssets: [mediaAsset({ sizeBytes: PNG.byteLength })],
      maxBytes: PNG.byteLength - 1,
      reader: { read: vi.fn(async () => PNG) },
    })).rejects.toThrow("size limit");
  });

  it("never chooses an arbitrary first image as Featured Image", async () => {
    await expect(prepareWordPressLocalMedia({
      document: imageDocument(),
      mediaAssets: [mediaAsset()],
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      featuredImageAssetId: "asset-not-selected",
      reader: { read: vi.fn(async () => PNG) },
    })).rejects.toThrow("Featured Image");
  });
});

function imageDocument(): ContentDocument {
  return Object.freeze({
    id: "document-1",
    title: "WordPress Media",
    blocks: Object.freeze([
      { id: "paragraph-1", type: "paragraph" as const, text: "Meaningful body." },
      { id: "image-1", type: "image" as const, source: SOURCE, alt: "Canonical ALT", assetId: "asset-1" },
    ]),
  });
}

function mediaAsset(metadataChange: Partial<MediaAsset["metadata"]> = {}): MediaAsset {
  return Object.freeze({
    id: "asset-1",
    kind: "image",
    source: SOURCE,
    metadata: Object.freeze({
      createdAt: "2026-07-29T00:00:00.000Z",
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-1",
      blockId: "image-1",
      fileName: "image.png",
      mimeType: "image/png",
      sizeBytes: PNG.byteLength,
      alt: "Stored ALT",
      ...metadataChange,
    }),
  });
}
