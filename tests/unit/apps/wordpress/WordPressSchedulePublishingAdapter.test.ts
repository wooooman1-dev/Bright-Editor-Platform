import { afterEach, describe, expect, it, vi } from "vitest";

import { WordPressDraftPublishingAdapter } from "../../../../apps/wordpress";

afterEach(() => vi.restoreAllMocks());

const credentials = {
  siteUrl: "https://example.com",
  username: "editor",
  applicationPassword: "application-secret",
} as const;
const html = "<h2>Section</h2>\n<p>Meaningful body and details.</p>";

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function payloadOf(request: ReturnType<typeof vi.fn<typeof fetch>>): Record<string, unknown> {
  return JSON.parse(String(request.mock.calls[0][1]?.body)) as Record<string, unknown>;
}

async function create(
  request: ReturnType<typeof vi.fn<typeof fetch>>,
  overrides: Readonly<{ status: "draft" | "future"; scheduledAt?: string }>,
) {
  return new WordPressDraftPublishingAdapter(request).createDraft({
    ...credentials,
    payload: {
      title: "Approved title",
      content: html,
      excerpt: "Summary",
      categories: ["12"],
      ...overrides,
    },
  });
}

describe("WordPress scheduled publishing adapter", () => {
  it("sends status future with a UTC date_gmt converted from the requested instant", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ id: 501, status: "future" }, 201));

    await create(request, { status: "future", scheduledAt: "2026-09-01T18:00:00+09:00" });

    expect(payloadOf(request)).toMatchObject({
      status: "future",
      date_gmt: "2026-09-01T09:00:00",
    });
  });

  it("keeps a draft schedule unpublished while still recording the intended time", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ id: 501, status: "draft" }, 201));

    await create(request, { status: "draft", scheduledAt: "2026-09-01T18:00:00+09:00" });

    expect(payloadOf(request)).toMatchObject({
      status: "draft",
      date_gmt: "2026-09-01T09:00:00",
    });
  });

  it("omits date_gmt entirely when no schedule is requested", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ id: 501, status: "draft" }, 201));

    await create(request, { status: "draft" });

    expect(payloadOf(request)).not.toHaveProperty("date_gmt");
  });

  it("refuses a future publication without a scheduled time", async () => {
    const request = vi.fn<typeof fetch>();

    await expect(create(request, { status: "future" })).rejects.toThrow(/scheduled time/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a scheduled time without a timezone offset so local time is never assumed", async () => {
    const request = vi.fn<typeof fetch>();

    await expect(create(request, { status: "future", scheduledAt: "2026-09-01T18:00:00" }))
      .rejects.toThrow(/timezone offset/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("verifies the external post against the requested status and scheduled time", async () => {
    const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());

    const verification = adapter.verifyDraft({
      externalId: "501",
      status: "future",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      tagIds: [],
      dateGmt: "2026-09-01T09:00:00",
    }, {
      externalId: "501",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      mediaUrls: [],
      status: "future",
      scheduledAt: "2026-09-01T18:00:00+09:00",
    });

    expect(verification.verified).toBe(true);
    expect(verification.checks.find((check) => check.key === "scheduled_time")?.passed).toBe(true);
  });

  it("fails verification when WordPress applied a different scheduled time", async () => {
    const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());

    const verification = adapter.verifyDraft({
      externalId: "501",
      status: "future",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      tagIds: [],
      dateGmt: "2026-09-01T10:00:00",
    }, {
      externalId: "501",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      mediaUrls: [],
      status: "future",
      scheduledAt: "2026-09-01T18:00:00+09:00",
    });

    expect(verification.verified).toBe(false);
    expect(verification.checks.find((check) => check.key === "scheduled_time")?.passed).toBe(false);
  });

  it("fails verification when WordPress left the post as a draft for a future request", async () => {
    const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());

    const verification = adapter.verifyDraft({
      externalId: "501",
      status: "draft",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      tagIds: [],
      dateGmt: "2026-09-01T09:00:00",
    }, {
      externalId: "501",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      mediaUrls: [],
      status: "future",
      scheduledAt: "2026-09-01T18:00:00+09:00",
    });

    expect(verification.checks.find((check) => check.key === "draft_status")?.passed).toBe(false);
  });

  it("keeps expecting a draft status when no schedule expectation is given", async () => {
    const adapter = new WordPressDraftPublishingAdapter(vi.fn<typeof fetch>());

    const verification = adapter.verifyDraft({
      externalId: "501",
      status: "future",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      tagIds: [],
    }, {
      externalId: "501",
      title: "Approved title",
      content: html,
      categoryIds: ["12"],
      mediaUrls: [],
    });

    expect(verification.checks.find((check) => check.key === "draft_status")?.passed).toBe(false);
    expect(verification.checks.some((check) => check.key === "scheduled_time")).toBe(false);
  });
});
