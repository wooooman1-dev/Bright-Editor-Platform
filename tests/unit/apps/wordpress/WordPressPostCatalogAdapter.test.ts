import { describe, expect, it, vi } from "vitest";

import { WordPressPostCatalogAdapter } from "../../../../apps/wordpress/WordPressPostCatalogAdapter";

describe("WordPressPostCatalogAdapter", () => {
  it("reads only published posts with canonical category ids", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify([{
        id: 10,
        link: "https://example.com/saving-account/",
        date: "2026-07-30T10:00:00",
        status: "publish",
        title: { rendered: "통장 쪼개기 방법" },
        excerpt: { rendered: "<p>생활비 통장을 나누는 기준</p>" },
        categories: [12],
      }]), {
        status: 200,
        headers: { "X-WP-TotalPages": "1" },
      });
    });
    const result = await new WordPressPostCatalogAdapter(
      request as typeof fetch,
      () => "2026-07-30T12:00:00.000Z",
    ).listAllPublishedPosts({
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "secret",
      platformConnectionId: "wordpress-1",
    });

    expect(result.posts).toEqual([{
      externalPostId: "10",
      title: "통장 쪼개기 방법",
      publishedUrl: "https://example.com/saving-account/",
      publishedAt: "2026-07-30T10:00:00",
      excerpt: "생활비 통장을 나누는 기준",
      categoryIds: ["12"],
    }]);
    expect(String(request.mock.calls[0]?.[0])).toContain("status=publish");
    expect(String(request.mock.calls[0]?.[0])).toContain("context=view");
    expect((request.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      Accept: "application/json",
    });
  });

  it("rejects a published post URL outside the connected WordPress site", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify([{
      id: 12,
      link: "https://attacker.example/article/",
      status: "publish",
      title: { rendered: "외부 글" },
      categories: [12],
    }]), { status: 200, headers: { "X-WP-TotalPages": "1" } }));

    await expect(new WordPressPostCatalogAdapter(
      request as typeof fetch,
    ).listAllPublishedPosts({
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "secret",
      platformConnectionId: "wordpress-1",
    })).rejects.toThrow("unsafe or foreign");
  });

  it("never accepts a non-public post from the published catalog", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify([{
      id: 11,
      link: "https://example.com/?p=11",
      status: "draft",
      title: { rendered: "임시글" },
      categories: [12],
    }]), { status: 200, headers: { "X-WP-TotalPages": "1" } }));

    await expect(new WordPressPostCatalogAdapter(
      request as typeof fetch,
    ).listAllPublishedPosts({
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "secret",
      platformConnectionId: "wordpress-1",
    })).rejects.toThrow("non-public");
  });
});