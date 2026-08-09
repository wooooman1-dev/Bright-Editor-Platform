import { describe, expect, it, vi } from "vitest";

import { auditWordPressSiteReadiness } from "../../../../apps/wordpress/approval/WordPressSiteReadinessAudit";

const checkedAt = "2026-07-30T00:00:00.000Z";
const homeHtml = `<!doctype html><html lang="ko"><head>
  <title>밝은 생활경제</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
  <header><nav class="main-navigation">
    <a href="/">홈</a>
    <a href="/category/life-economy">생활경제</a>
    <a href="/about">사이트 소개</a>
    <a href="/contact">문의하기</a>
    <a href="/privacy-policy">개인정보처리방침</a>
  </nav></header>
  <main>${"정부지원, 세금, 주거와 생활금융 제도를 공식 확인처와 함께 설명합니다. ".repeat(12)}</main>
</body></html>`;

describe("WordPressSiteReadinessAudit", () => {
  it("detects HTTPS, robots, sitemap, trust pages, navigation, archive, and viewport without any write request", async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (init?.method !== "GET") throw new Error("Only public GET requests are allowed.");
      const url = String(input);
      if (url === "https://example.com/") return htmlResponse(homeHtml);
      if (url === "https://example.com/robots.txt") {
        return textResponse("User-agent: *\nAllow: /\nSitemap: https://example.com/wp-sitemap.xml", "text/plain");
      }
      if (url === "https://example.com/wp-sitemap.xml") {
        return textResponse("<?xml version=\"1.0\"?><sitemapindex></sitemapindex>", "application/xml");
      }
      return new Response("not found", { status: 404 });
    });

    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com",
      checkedAt,
      expectedTerms: ["생활경제"],
      fetcher,
    });

    expect(result.status).toBe("passed");
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "https", passed: true }),
      expect.objectContaining({ key: "robots", passed: true }),
      expect.objectContaining({ key: "crawler_access", passed: true }),
      expect.objectContaining({ key: "sitemap", passed: true }),
      expect.objectContaining({ key: "privacy", passed: true }),
      expect.objectContaining({ key: "about", passed: true, requirement: "recommended" }),
      expect.objectContaining({ key: "contact", passed: true, requirement: "recommended" }),
      expect.objectContaining({ key: "navigation", passed: true }),
      expect.objectContaining({ key: "category_archive", passed: true }),
      expect.objectContaining({ key: "mobile_viewport", passed: true }),
    ]));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
    expect(fetcher.mock.calls.some((call) => /wp-admin|wp-login/i.test(String(call[0])))).toBe(false);
  });

  it("does not generate user-controlled manual or external approval checks", async () => {
    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com",
      checkedAt,
      expectedTerms: ["생활경제"],
      fetcher: successfulFetcher(),
    });

    const keys = result.checks.map((check) => check.key);
    expect(keys).not.toEqual(expect.arrayContaining([
      "theme_plugin_review",
      "mobile_visual_review",
      "performance_review",
      "copyright_review",
      "site_quality_consistency",
      "search_console_review",
      "adsense_external_approval",
    ]));
    expect(result.checks.some((check) => check.requirement === "manual")).toBe(false);
    expect(result.status).toBe("passed");
  });

  it("records a bounded redirect and blocks a public placeholder homepage", async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (init?.method !== "GET") throw new Error("Only public GET requests are allowed.");
      const url = String(input);
      if (url === "http://example.com/") {
        return new Response(null, { status: 302, headers: { location: "https://example.com/" } });
      }
      if (url === "https://example.com/") {
        return htmlResponse("<!doctype html><html><head><title>Coming Soon</title><meta name=\"viewport\" content=\"width=device-width\"></head><body><main>Under maintenance. Coming soon.</main></body></html>");
      }
      return new Response("not found", { status: 404 });
    });

    const result = await auditWordPressSiteReadiness({
      siteUrl: "http://example.com",
      checkedAt,
      expectedTerms: ["생활경제"],
      fetcher,
    });

    expect(result.status).toBe("blocked");
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "public_access",
      passed: true,
      message: expect.stringContaining("주소 이동 1회"),
    }));
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "placeholder_free", passed: false }));
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
  });

  it("does not pass a homepage with noindex or a robots.txt that blocks public crawlers", async () => {
    const blockedHtml = homeHtml.replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>');
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://example.com/") return htmlResponse(blockedHtml);
      if (url === "https://example.com/robots.txt") return textResponse("User-agent: *\nDisallow: /", "text/plain");
      return new Response("not found", { status: 404 });
    });

    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com",
      checkedAt,
      expectedTerms: ["생활경제"],
      fetcher,
    });

    expect(result.status).toBe("needs_review");
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "crawler_access", passed: false }));
  });

  it("classifies an intentional homepage noindex as setup work when robots.txt still allows crawlers", async () => {
    const noindexHtml = homeHtml.replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>');
    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com",
      checkedAt,
      expectedTerms: ["생활경제"],
      fetcher: vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://example.com/") return htmlResponse(noindexHtml);
        if (url === "https://example.com/robots.txt") {
          return textResponse("User-agent: *\nAllow: /\nSitemap: https://example.com/wp-sitemap.xml", "text/plain");
        }
        if (url === "https://example.com/wp-sitemap.xml") {
          return textResponse("<?xml version=\"1.0\"?><urlset></urlset>", "application/xml");
        }
        return new Response("not found", { status: 404 });
      }),
    });

    expect(result.checks).toContainEqual(expect.objectContaining({ key: "crawler_access", passed: false, requirement: "setup" }));
    expect(result.status).toBe("needs_review");
  });

  it("blocks timeout, redirect-limit, and oversized response fixtures with actionable diagnostics", async () => {
    const timeout = await auditWordPressSiteReadiness({
      siteUrl: "https://timeout.example.com",
      checkedAt,
      expectedTerms: [],
      fetcher: vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }),
    });
    expect(timeout.status).toBe("blocked");
    expect(timeout.checks.find((check) => check.key === "public_access")?.message).toContain("요청 시간이 초과");

    const redirects = await auditWordPressSiteReadiness({
      siteUrl: "https://redirect.example.com",
      checkedAt,
      expectedTerms: [],
      maxRedirects: 1,
      fetcher: vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location: "https://redirect.example.com/next" },
      })),
    });
    expect(redirects.status).toBe("blocked");
    expect(redirects.checks.find((check) => check.key === "public_access")?.message).toContain("주소 이동 제한 1회");

    const oversized = await auditWordPressSiteReadiness({
      siteUrl: "https://large.example.com",
      checkedAt,
      expectedTerms: [],
      maxResponseBytes: 32,
      fetcher: vi.fn(async () => new Response("x".repeat(100), {
        status: 200,
        headers: { "content-length": "100", "content-type": "text/html" },
      })),
    });
    expect(oversized.status).toBe("blocked");
    expect(oversized.checks.find((check) => check.key === "public_access")?.message).toContain("응답 크기");
  });

  it("rejects missing, invalid, local, and admin site URLs before requesting the network", async () => {
    for (const siteUrl of ["", "not-a-url", "http://127.0.0.1", "https://example.com/wp-admin/"]) {
      const fetcher = vi.fn();
      const result = await auditWordPressSiteReadiness({ siteUrl, checkedAt, expectedTerms: [], fetcher });
      expect(result.status).toBe("blocked");
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
});

function successfulFetcher() {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url === "https://example.com/") return htmlResponse(homeHtml);
    if (url === "https://example.com/robots.txt") {
      return textResponse("Sitemap: https://example.com/wp-sitemap.xml", "text/plain");
    }
    if (url === "https://example.com/wp-sitemap.xml") {
      return textResponse("<?xml version=\"1.0\"?><urlset></urlset>", "application/xml");
    }
    return new Response("not found", { status: 404 });
  });
}

function htmlResponse(html: string): Response {
  return textResponse(html, "text/html; charset=utf-8");
}

function textResponse(body: string, contentType: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}
