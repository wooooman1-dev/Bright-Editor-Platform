import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WordPressDraftPublishingAdapter,
  type WordPressExternalDraft,
} from "../../../../apps/wordpress";

afterEach(() => vi.restoreAllMocks());

const credentials = {
  siteUrl: "https://example.com/wp-admin",
  username: "editor",
  applicationPassword: "application-secret",
} as const;
const html = '<h2>Section</h2>\n<p>Meaningful body &amp; details.</p>\n<figure><img src="https://example.com/uploads/image.png" alt="ALT"></figure>';

describe("WordPress draft publishing adapter", () => {
  it("creates a Draft-only payload without tags and re-reads the external Post", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 501, status: "draft" }, 201))
      .mockResolvedValueOnce(response({
        id: 501,
        status: "draft",
        title: { raw: "Approved title" },
        content: { raw: html },
        categories: [12, 34],
        tags: [],
        featured_media: 91,
      }));
    const adapter = new WordPressDraftPublishingAdapter(request);

    const created = await adapter.createDraft({
      ...credentials,
      payload: {
        title: "Approved title",
        content: html,
        excerpt: "Summary",
        status: "draft",
        categories: ["12", "34"],
        slug: "approved-title",
        featuredMediaId: "91",
      },
    });
    const draft = await adapter.readDraft({ ...credentials, externalId: created.externalId });
    const verification = adapter.verifyDraft(draft, {
      externalId: "501",
      title: "Approved title",
      content: html,
      categoryIds: ["12", "34"],
      mediaUrls: ["https://example.com/uploads/image.png"],
      featuredMediaId: "91",
    });

    expect(verification.verified).toBe(true);
    expect(request.mock.calls[1][0]).toBe("https://example.com/wp-json/wp/v2/posts/501?context=edit");
    const payload = JSON.parse(String(request.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      title: "Approved title",
      content: html,
      excerpt: "Summary",
      status: "draft",
      categories: [12, 34],
      slug: "approved-title",
      featured_media: 91,
    });
    expect(payload).not.toHaveProperty("tags");
  });

  it.each([
    ["title", { title: "Different title" }],
    ["categories", { categoryIds: ["12"] }],
    ["media_urls", { content: "<p>Meaningful body &amp; details.</p>" }],
    ["featured_media", { featuredMediaId: "92" }],
    ["tags_unused", { tagIds: ["7"] }],
  ])("blocks %s mismatch after external Post re-read", (failedKey, changes) => {
    const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());
    const draft: WordPressExternalDraft = {
      externalId: "501",
      status: "draft",
      title: "Approved title",
      content: html,
      categoryIds: ["12", "34"],
      tagIds: [],
      featuredMediaId: "91",
      ...changes,
    };
    const verification = adapter.verifyDraft(draft, {
      externalId: "501",
      title: "Approved title",
      content: html,
      categoryIds: ["12", "34"],
      mediaUrls: ["https://example.com/uploads/image.png"],
      featuredMediaId: "91",
    });
    expect(verification.verified).toBe(false);
    expect(verification.checks).toContainEqual({ key: failedKey, passed: false });
  });

  it("accepts ordered meaningful segments through WordPress comments, wrappers, whitespace, and entities", () => {
    const expected = "<h2>Eligibility &amp; timing</h2><p>Check the official notice&nbsp;before applying.</p><ul><li>First step</li><li>Second step</li></ul>";
    const actual = `
      <!-- wp:group --><div class="wp-block-group">
        <!-- wp:heading --><h2> Eligibility &#38; timing </h2><!-- /wp:heading -->
        <div><p>Check the official notice before   applying.</p></div>
        <!-- wp:list --><ul><li>First step</li><li>Second step</li></ul><!-- /wp:list -->
      </div><!-- /wp:group -->`;

    expect(contentVerification(actual, expected)).toBe(true);
  });

  it.each([
    ["missing expected paragraph", "<h2>Eligibility &amp; timing</h2><ul><li>First step</li><li>Second step</li></ul>"],
    ["truncated body", "<h2>Eligibility &amp; timing</h2><p>Check the official notice</p><ul><li>First step</li>"],
    ["replaced body", "<h2>Different topic</h2><p>Unrelated replacement content.</p>"],
  ])("rejects %s", (_label, actual) => {
    const expected = "<h2>Eligibility &amp; timing</h2><p>Check the official notice before applying.</p><ul><li>First step</li><li>Second step</li></ul>";
    expect(contentVerification(actual, expected)).toBe(false);
  });

  it("normalizes featured_media 0 to no Featured Image and verifies the absence", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({
      id: 501,
      status: "draft",
      title: { raw: "Approved title" },
      content: { raw: "<p>Meaningful body.</p>" },
      categories: [12],
      tags: [],
      featured_media: 0,
    }));
    const adapter = new WordPressDraftPublishingAdapter(request);
    const draft = await adapter.readDraft({ ...credentials, externalId: "501" });

    expect(draft.featuredMediaId).toBeUndefined();
    expect(adapter.verifyDraft(draft, {
      externalId: "501",
      title: "Approved title",
      content: "<p>Meaningful body.</p>",
      categoryIds: ["12"],
      mediaUrls: [],
    }).checks).toContainEqual({ key: "featured_media", passed: true });
  });

  it.each([
    [undefined, "91", false],
    ["91", "91", true],
    ["91", "92", false],
  ])("verifies expected Featured Image %s against external ID %s", (expectedId, actualId, passed) => {
    const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());
    const verification = adapter.verifyDraft({
      externalId: "501",
      status: "draft",
      title: "Approved title",
      content: "<p>Meaningful body.</p>",
      categoryIds: ["12"],
      tagIds: [],
      featuredMediaId: actualId,
    }, {
      externalId: "501",
      title: "Approved title",
      content: "<p>Meaningful body.</p>",
      categoryIds: ["12"],
      mediaUrls: [],
      ...(expectedId ? { featuredMediaId: expectedId } : {}),
    });
    expect(verification.checks).toContainEqual({ key: "featured_media", passed });
  });

  it("does not expose secrets or Authorization headers when WordPress fails", async () => {
    const authorization = `Basic ${Buffer.from(`editor:${credentials.applicationPassword}`).toString("base64")}`;
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(`${credentials.applicationPassword} ${authorization}`));
    const error = await new WordPressDraftPublishingAdapter(request).createDraft({
      ...credentials,
      payload: { title: "Title", content: "<p>Body</p>", excerpt: "", status: "draft", categories: ["12"] },
    }).catch((failure: unknown) => failure);
    expect(String(error)).not.toContain(credentials.applicationPassword);
    expect(String(error)).not.toContain(authorization);
  });
});

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function contentVerification(actual: string, expected: string): boolean {
  const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());
  return adapter.verifyDraft({
    externalId: "501",
    status: "draft",
    title: "Approved title",
    content: actual,
    categoryIds: ["12"],
    tagIds: [],
  }, {
    externalId: "501",
    title: "Approved title",
    content: expected,
    categoryIds: ["12"],
    mediaUrls: [],
  }).checks.find((check) => check.key === "meaningful_content")?.passed ?? false;
}
