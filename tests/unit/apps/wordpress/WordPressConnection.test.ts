import { afterEach, describe, expect, it, vi } from "vitest";
import { WordPressConnectionAdapter, normalizeSiteUrl } from "../../../../apps/wordpress";
afterEach(() => vi.restoreAllMocks());
describe("WordPress connection", () => {
  it("normalizes valid URLs and rejects invalid URLs", () => { expect(normalizeSiteUrl("https://example.com/path")).toBe("https://example.com"); expect(() => normalizeSiteUrl("not a url")).toThrow("valid WordPress"); });
  it("verifies user and draft permission without returning password", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ name: "Site", home: "https://example.com" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ name: "Editor", capabilities: { edit_posts: true } }), { status: 200 }));
    const result = await new WordPressConnectionAdapter().verify({ siteUrl: "https://example.com", username: "editor", applicationPassword: "app-secret" });
    expect(result.canCreateDrafts).toBe(true); expect(JSON.stringify(result)).not.toContain("app-secret");
  });
  it("returns safe authentication and permission errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(new WordPressConnectionAdapter().verify({ siteUrl: "https://example.com", username: "editor", applicationPassword: "bad" })).rejects.toThrow("authentication failed");
  });
});
