import { describe, expect, it, vi } from "vitest";

import { WordPressDraftPublishingAdapter } from "../../../../apps/wordpress";

const credentials = {
  siteUrl: "https://example.com",
  username: "editor",
  applicationPassword: "application-secret",
} as const;

const seoMetadata = {
  focusKeyphrase: "고정지출 줄이는 방법",
  seoTitle: "고정지출 줄이는 방법 4단계",
  metaDescription: "고정지출을 점검하고 줄이는 순서를 정리했습니다.",
} as const;

describe("WordPress Yoast SEO metadata", () => {
  it("discovers all required Yoast post-meta fields through the authenticated OPTIONS schema", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({
      schema: {
        properties: {
          meta: {
            properties: {
              _yoast_wpseo_focuskw: { type: "string" },
              _yoast_wpseo_title: { type: "string" },
              _yoast_wpseo_metadesc: { type: "string" },
            },
          },
        },
      },
    }));
    const adapter = new WordPressDraftPublishingAdapter(request);

    await expect(adapter.capabilities(credentials)).resolves.toEqual({
      yoastSeoMetadata: true,
      writableMetaKeys: [
        "_yoast_wpseo_focuskw",
        "_yoast_wpseo_title",
        "_yoast_wpseo_metadesc",
      ],
    });
    expect(request).toHaveBeenCalledWith(
      "https://example.com/wp-json/wp/v2/posts",
      expect.objectContaining({ method: "OPTIONS" }),
    );
  });

  it("writes, re-reads, and verifies canonical Yoast SEO metadata", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 501, status: "draft" }, 201))
      .mockResolvedValueOnce(response({
        id: 501,
        status: "draft",
        title: { raw: "고정지출 줄이는 방법" },
        content: { raw: "<p>Body</p>" },
        categories: [12],
        tags: [],
        featured_media: 0,
        meta: {
          _yoast_wpseo_focuskw: seoMetadata.focusKeyphrase,
          _yoast_wpseo_title: seoMetadata.seoTitle,
          _yoast_wpseo_metadesc: seoMetadata.metaDescription,
        },
      }));
    const adapter = new WordPressDraftPublishingAdapter(request);

    const created = await adapter.createDraft({
      ...credentials,
      payload: {
        title: "고정지출 줄이는 방법",
        content: "<p>Body</p>",
        excerpt: seoMetadata.metaDescription,
        status: "draft",
        categories: ["12"],
        seoMetadata,
      },
    });
    const draft = await adapter.readDraft({ ...credentials, externalId: created.externalId });
    const verification = adapter.verifyDraft(draft, {
      externalId: "501",
      title: "고정지출 줄이는 방법",
      content: "<p>Body</p>",
      categoryIds: ["12"],
      mediaUrls: [],
      seoMetadata,
    });

    const payload = JSON.parse(String(request.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(payload.meta).toEqual({
      _yoast_wpseo_focuskw: seoMetadata.focusKeyphrase,
      _yoast_wpseo_title: seoMetadata.seoTitle,
      _yoast_wpseo_metadesc: seoMetadata.metaDescription,
    });
    expect(draft.seoMetadata).toEqual(seoMetadata);
    expect(verification.checks).toContainEqual({ key: "seo_metadata", passed: true });
    expect(verification.verified).toBe(true);
  });

  it("reports incomplete Yoast capability without attempting a write", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({
      schema: {
        properties: {
          meta: {
            properties: {
              _yoast_wpseo_title: { type: "string" },
            },
          },
        },
      },
    }));
    const adapter = new WordPressDraftPublishingAdapter(request);

    await expect(adapter.capabilities(credentials)).resolves.toEqual({
      yoastSeoMetadata: false,
      writableMetaKeys: ["_yoast_wpseo_title"],
    });
    expect(request).toHaveBeenCalledOnce();
  });
});

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}