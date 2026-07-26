import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
const providerMocks = vi.hoisted(() => ({ generate: vi.fn() }));
const storageMocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));

vi.mock("../../../../app/application/studio-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../app/application/studio-store")>();
  return { ...original, studioStore: storeMocks };
});
vi.mock("../../../../app/application/media/OpenAIImageProvider", () => ({
  OpenAIImageProvider: class {
    generate = providerMocks.generate;
  },
}));
vi.mock("../../../../app/application/media/LocalMediaStorage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../app/application/media/LocalMediaStorage")>();
  return {
    ...original,
    LocalMediaStorage: class {
      save = storageMocks.save;
      remove = storageMocks.remove;
    },
  };
});

import { GET, POST } from "../../../../app/api/media/route";
import type { UserData } from "../../../../app/user-flow/user-data";
import type { ImageBlock, ImageBlockPurpose } from "../../../../core/content";
import type { MediaAsset } from "../../../../core/media";

describe("media route image cost policy", () => {
  let current: UserData;

  beforeEach(() => {
    current = userData([planned("hero", "hero", "근력운동 유산소운동 비교 대표 이미지")]);
    storeMocks.get.mockImplementation(async () => current);
    storeMocks.update.mockImplementation(async (_collection: string, _stateId: string, updater: (value: UserData | undefined) => UserData) => {
      current = updater(current);
      return current;
    });
    storageMocks.save.mockResolvedValue({ source: "/api/media/generated.png", storageKey: "generated.png" });
    storageMocks.remove.mockResolvedValue(undefined);
    providerMocks.generate.mockResolvedValue({
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      fileExtension: "png",
      mimeType: "image/png",
      model: "test-image-model",
      quality: "medium",
      size: "1024x1024",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("creates a new hero instead of reusing another post's representative image", async () => {
    current = {
      ...current,
      mediaMetadata: [asset({
        id: "old-hero",
        contentId: "older-content",
        alt: "근력운동 유산소운동 비교 대표 이미지",
        prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
        purpose: "hero",
        sourceType: "ai_generated",
      })],
    };

    const response = await POST(postRequest({ action: "generate", contentId: "content-1", blockId: "hero", prompt: "근력운동과 유산소운동을 나란히 비교한 장면", alt: "근력운동 유산소운동 비교 대표 이미지" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ reused: false, generation: { model: "test-image-model" } });
    expect(providerMocks.generate).toHaveBeenCalledOnce();
    expect(storageMocks.save).toHaveBeenCalledOnce();
  });

  it("returns no Project reuse candidates for a hero block", async () => {
    current = {
      ...current,
      mediaMetadata: [asset({
        id: "old-inline",
        contentId: "older-content",
        alt: "본문 운동 이미지",
        prompt: "운동 자세 설명 장면",
        purpose: "inline",
        sourceType: "upload",
      })],
    };

    const response = await GET(new Request("http://localhost/api/media?contentId=content-1&blockId=hero"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ assets: [], reuseAllowed: false, reusePolicy: "hero_unique" });
  });

  it("lists only non-hero Project media for a body block", async () => {
    current = userData([planned("inline", "inline", "운동 자세 본문 이미지")], [
      asset({ id: "old-hero", contentId: "older-content", alt: "운동 자세 대표 이미지", prompt: "운동 자세 본문 이미지", purpose: "hero", sourceType: "ai_generated" }),
      asset({ id: "body-image", contentId: "older-content", alt: "운동 자세 본문 이미지", prompt: "운동 자세 본문 이미지", purpose: "inline", sourceType: "upload" }),
    ]);

    const response = await GET(new Request("http://localhost/api/media?contentId=content-1&blockId=inline"));
    const body = await response.json() as { assets: MediaAsset[]; reuseAllowed: boolean; reusePolicy: string };

    expect(response.status).toBe(200);
    expect(body.reuseAllowed).toBe(true);
    expect(body.reusePolicy).toBe("body_only");
    expect(body.assets.map((item) => item.id)).toEqual(["body-image"]);
  });

  it("blocks a second automatic AI image for the same content", async () => {
    current = {
      ...current,
      mediaMetadata: [asset({
        id: "already-generated",
        contentId: "content-1",
        alt: "기존 대표 이미지",
        prompt: "기존 대표 장면",
        purpose: "hero",
        sourceType: "ai_generated",
      })],
    };

    const response = await POST(postRequest({ action: "generate", contentId: "content-1", blockId: "hero", prompt: "새 대표 장면", alt: "새 대표 이미지" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("원고당 최대 1장") });
    expect(providerMocks.generate).not.toHaveBeenCalled();
  });

  it("allows an explicit paid AI replacement for an infographic Bright card", async () => {
    current = userData([planned("infographic", "infographic", "대화 테스트 운동 인포그래픽")]);

    const response = await POST(postRequest({ action: "generate", mode: "manual", contentId: "content-1", blockId: "infographic", prompt: "대화 테스트 운동 인포그래픽", alt: "대화 테스트 운동 인포그래픽" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ reused: false, generation: { model: "test-image-model" } });
    expect(providerMocks.generate).toHaveBeenCalledOnce();
  });

  it("keeps automatic AI generation blocked for free Bright cards", async () => {
    current = userData([planned("comparison", "comparison", "운동 비교 카드")]);

    const response = await POST(postRequest({ action: "generate", contentId: "content-1", blockId: "comparison", prompt: "운동 비교 카드", alt: "운동 비교 카드" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("대표이미지 한 개") });
    expect(providerMocks.generate).not.toHaveBeenCalled();
  });

  it("blocks paid AI generation for body image purposes", async () => {
    current = userData([planned("inline", "inline", "운동 자세 본문 이미지")]);

    const response = await POST(postRequest({ action: "generate", mode: "manual", contentId: "content-1", blockId: "inline", prompt: "운동 자세", alt: "운동 자세" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("본문 이미지는 비용 없는") });
    expect(providerMocks.generate).not.toHaveBeenCalled();
  });

  it("allows the editor to explicitly regenerate the current content's hero", async () => {
    current = {
      ...current,
      mediaMetadata: [asset({
        id: "already-generated",
        contentId: "content-1",
        alt: "기존 대표 이미지",
        prompt: "기존 대표 장면",
        purpose: "hero",
        sourceType: "ai_generated",
      })],
    };

    const response = await POST(postRequest({ action: "generate", mode: "manual", contentId: "content-1", blockId: "hero", prompt: "사용자가 명시적으로 요청한 새 대표이미지", alt: "새 대표이미지" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ reused: false, generation: { model: "test-image-model" } });
    expect(providerMocks.generate).toHaveBeenCalledOnce();
    expect(storageMocks.save).toHaveBeenCalledOnce();
    expect(current.mediaMetadata?.filter((item) => item.metadata.sourceType === "ai_generated")).toHaveLength(2);
  });
});

function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function userData(blocks: ImageBlock[], mediaMetadata?: MediaAsset[]): UserData {
  return {
    workspace: {
      id: "workspace-1",
      name: "Studio",
      settings: {
        enabledPlatforms: ["tistory"],
        publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true },
        appearance: { theme: "system" },
      },
    },
    brands: [],
    projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "now", updatedAt: "now" }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "Draft",
      body: "",
      status: "draft",
      primaryKeyword: "운동 비교",
      relatedKeywords: [],
      searchIntent: "운동 선택",
      createdAt: "now",
      updatedAt: "now",
      document: { id: "content-1", title: "Draft", blocks },
    }],
    ...(mediaMetadata ? { mediaMetadata } : {}),
  };
}

function planned(id: string, purpose: ImageBlockPurpose, alt: string): ImageBlock {
  return {
    id,
    type: "image",
    source: "",
    sourceType: "planned",
    purpose,
    alt,
    prompt: `${alt}를 구체적으로 표현`,
  };
}

function asset(input: Readonly<{
  id: string;
  contentId: string;
  alt: string;
  prompt: string;
  purpose: ImageBlockPurpose;
  sourceType: "upload" | "ai_generated";
}>): MediaAsset {
  return {
    id: input.id,
    kind: "image",
    source: `/api/media/${input.id}.png`,
    metadata: {
      alt: input.alt,
      contentId: input.contentId,
      createdAt: "2026-07-26T00:00:00.000Z",
      projectId: "project-1",
      prompt: input.prompt,
      purpose: input.purpose,
      sourceType: input.sourceType,
      workspaceId: "workspace-1",
    },
  };
}
