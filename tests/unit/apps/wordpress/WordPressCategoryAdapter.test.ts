import { afterEach, describe, expect, it, vi } from "vitest";

import { WordPressCategoryAdapter } from "../../../../apps/wordpress";

afterEach(() => vi.restoreAllMocks());

describe("WordPress category adapter", () => {
  it("reads paginated categories and normalizes WordPress IDs to strings", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 12, name: "First", slug: "first", parent: 0 },
        { id: 34, name: "Child", slug: "child", parent: 12 },
      ]), { status: 200, headers: { "X-WP-TotalPages": "2" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 56, name: "Second page", slug: "second-page", parent: 0 },
      ]), { status: 200, headers: { "X-WP-TotalPages": "2" } }));
    const adapter = new WordPressCategoryAdapter(globalThis.fetch, () => "2026-07-29T00:00:00.000Z");
    const credentials = {
      platformConnectionId: "connection-1",
      siteUrl: "https://example.com/wp-admin",
      username: "editor",
      applicationPassword: "application-password",
      pageSize: 2,
    } as const;

    const first = await adapter.listCategories(credentials);
    const second = await adapter.listCategories({ ...credentials, page: first.nextPage });

    expect(first).toMatchObject({
      platform: "wordpress",
      platformConnectionId: "connection-1",
      hasMore: true,
      nextPage: 2,
      retrievedAt: "2026-07-29T00:00:00.000Z",
      categories: [
        { id: "12", externalCategoryId: "12", name: "First", selectable: true },
        { id: "34", externalCategoryId: "34", parentExternalCategoryId: "12" },
      ],
    });
    expect(second).toMatchObject({ hasMore: false, categories: [{ id: "56" }] });
    expect(second.nextPage).toBeUndefined();
    expect(request.mock.calls[0][0]).toBe("https://example.com/wp-json/wp/v2/categories?context=edit&page=1&per_page=2");
    expect(request.mock.calls[1][0]).toBe("https://example.com/wp-json/wp/v2/categories?context=edit&page=2&per_page=2");
  });

  it("does not expose the Application Password, Authorization header, or response body in failures or logs", async () => {
    const applicationPassword = "must-not-leak";
    const authorization = `Basic ${Buffer.from(`editor:${applicationPassword}`).toString("base64")}`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      applicationPassword,
      Authorization: authorization,
    }), { status: 403 }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const error = await new WordPressCategoryAdapter().listCategories({
      platformConnectionId: "connection-1",
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword,
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(applicationPassword);
    expect(String(error)).not.toContain(authorization);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();

    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error(`${applicationPassword} ${authorization}`));
    const networkError = await new WordPressCategoryAdapter().listCategories({
      platformConnectionId: "connection-1",
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword,
    }).catch((failure: unknown) => failure);
    expect(String(networkError)).not.toContain(applicationPassword);
    expect(String(networkError)).not.toContain(authorization);
  });
});
