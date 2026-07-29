import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WordPressMediaAdapter,
  WordPressMediaUploadUncertainError,
} from "../../../../apps/wordpress";

afterEach(() => vi.restoreAllMocks());

const credentials = {
  siteUrl: "https://example.com/wp-admin",
  username: "editor",
  applicationPassword: "application-secret",
} as const;

describe("WordPress media adapter", () => {
  it("uploads local bytes, stores canonical ALT, and verifies the external Media by re-read", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 91, source_url: "https://example.com/uploads/image.png" }, 201))
      .mockResolvedValueOnce(response({ id: 91, source_url: "https://example.com/uploads/image.png", alt_text: "Canonical ALT" }))
      .mockResolvedValueOnce(response({ id: 91, source_url: "https://example.com/uploads/image.png", alt_text: "Canonical ALT" }));
    const adapter = new WordPressMediaAdapter(request);

    const uploaded = await adapter.uploadMedia({
      ...credentials,
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      fileName: "image.png",
      mimeType: "image/png",
    });
    await adapter.storeAlt({ ...credentials, externalMediaId: uploaded.externalMediaId, alt: "Canonical ALT" });
    const read = await adapter.readMedia({ ...credentials, externalMediaId: uploaded.externalMediaId });

    expect(adapter.verifyMedia(read, { ...uploaded, alt: "Canonical ALT" })).toEqual({
      externalMediaId: "91",
      sourceUrl: "https://example.com/uploads/image.png",
      alt: "Canonical ALT",
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "https://example.com/wp-json/wp/v2/media",
      "https://example.com/wp-json/wp/v2/media/91",
      "https://example.com/wp-json/wp/v2/media/91?context=edit",
    ]);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ alt_text: "Canonical ALT" });
    expect(request.mock.calls[0][1]?.headers).toMatchObject({
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="image.png"',
    });
  });

  it("blocks source URL or ALT mismatches found by external re-read", () => {
    const adapter = new WordPressMediaAdapter(vi.fn<typeof fetch>());
    expect(() => adapter.verifyMedia({
      externalMediaId: "91",
      sourceUrl: "https://example.com/uploads/changed.png",
      alt: "Wrong ALT",
    }, {
      externalMediaId: "91",
      sourceUrl: "https://example.com/uploads/image.png",
      alt: "Canonical ALT",
    })).toThrow("re-read verification failed");
  });

  it("redacts the Application Password, Authorization header, and response body from failures and logs", async () => {
    const authorization = `Basic ${Buffer.from(`editor:${credentials.applicationPassword}`).toString("base64")}`;
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(`${credentials.applicationPassword} ${authorization}`));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const error = await new WordPressMediaAdapter(request).uploadMedia({
      ...credentials,
      bytes: new Uint8Array([1]),
      fileName: "image.png",
      mimeType: "image/png",
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(WordPressMediaUploadUncertainError);
    expect(String(error)).not.toContain(credentials.applicationPassword);
    expect(String(error)).not.toContain(authorization);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each([408, 500, 502, 503, 504])("classifies Media Upload HTTP %s as uncertain", async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    await expect(new WordPressMediaAdapter(request).uploadMedia(uploadInput()))
      .rejects.toBeInstanceOf(WordPressMediaUploadUncertainError);
  });

  it.each([400, 401, 403])("keeps explicit Media Upload HTTP %s as a definite failure", async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    const error = await new WordPressMediaAdapter(request).uploadMedia(uploadInput()).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WordPressMediaUploadUncertainError);
  });

  it.each([
    ["invalid JSON", new Response("not-json", { status: 201 })],
    ["missing Media ID", response({ source_url: "https://example.com/uploads/image.png" }, 201)],
    ["missing source URL", response({ id: 91 }, 201)],
  ])("classifies a successful %s response as uncertain", async (_label, result) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(result);
    await expect(new WordPressMediaAdapter(request).uploadMedia(uploadInput()))
      .rejects.toBeInstanceOf(WordPressMediaUploadUncertainError);
  });
});

function uploadInput() {
  return {
    ...credentials,
    bytes: new Uint8Array([137, 80, 78, 71]),
    fileName: "image.png",
    mimeType: "image/png" as const,
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}
