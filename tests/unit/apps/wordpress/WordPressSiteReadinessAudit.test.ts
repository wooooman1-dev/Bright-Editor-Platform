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

const trustPageHtml = (title: string) => `<!doctype html><html lang="ko"><head>
  <title>${title}</title>
  <meta name="robots" content="index, follow, max-image-preview:large">
</head><body><main>${"이 페이지는 사이트 운영 정보를 안내합니다. ".repeat(6)}</main></body></html>`;

const trustPageUrls = [
  ["https://example.com/privacy-policy", "개인정보처리방침"],
  ["https://example.com/about", "사이트 소개"],
  ["https://example.com/contact", "문의하기"],
] as const;

function trustPageResponse(url: string): Response | undefined {
  const match = trustPageUrls.find(([target]) => target === url);
  return match ? htmlResponse(trustPageHtml(match[1])) : undefined;
}

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
      const trustPage = trustPageResponse(url);
      if (trustPage) return trustPage;
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
      expect.objectContaining({ key: "trust_page_indexable", passed: true }),
    ]));
    // 홈, robots.txt, 사이트맵, 그리고 신뢰 페이지 3개를 실제로 열어 본다.
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
    expect(fetcher.mock.calls.some((call) => /wp-admin|wp-login/i.test(String(call[0])))).toBe(false);
  });

  /**
   * 2026-08-14 실측: 이 감사가 15건 전부 통과라고 보고한 날, Search Console 은
   * `/about/` 과 `/disclaimer/` 가 NOINDEX 로 제외됐다고 보고했다. 홈페이지에
   * 링크가 있다는 사실과 그 페이지가 색인될 수 있다는 사실은 다르다.
   */
  it("fails when a trust page the home page links to is excluded by a robots meta tag", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://example.com/") return htmlResponse(homeHtml);
      if (url === "https://example.com/robots.txt") return textResponse("Sitemap: https://example.com/wp-sitemap.xml", "text/plain");
      if (url === "https://example.com/wp-sitemap.xml") return textResponse("<?xml version=\"1.0\"?><urlset></urlset>", "application/xml");
      if (url === "https://example.com/about") {
        return htmlResponse('<!doctype html><html><head><title>사이트 소개</title><meta name="robots" content="noindex, follow"></head><body>소개</body></html>');
      }
      return trustPageResponse(url) ?? new Response("not found", { status: 404 });
    });

    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com", checkedAt, expectedTerms: ["생활경제"], fetcher,
    });

    const check = result.checks.find((item) => item.key === "trust_page_indexable");
    expect(check?.passed).toBe(false);
    expect(check?.message).toContain("사이트 소개");
    expect(check?.message).toContain("robots 메타태그");
    // D-039: 차단에는 사용자가 실제로 할 수 있는 다음 행동이 붙어야 한다.
    expect(check?.action).toContain("https://example.com/about");
    expect(result.status).not.toBe("passed");
    // 링크 존재 검사는 그대로 통과한다 — 두 검사는 서로 다른 사실을 말한다.
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "about", passed: true }));
  });

  it("fails when a trust page is excluded by an X-Robots-Tag header with no noindex in the markup", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://example.com/") return htmlResponse(homeHtml);
      if (url === "https://example.com/robots.txt") return textResponse("Sitemap: https://example.com/wp-sitemap.xml", "text/plain");
      if (url === "https://example.com/wp-sitemap.xml") return textResponse("<?xml version=\"1.0\"?><urlset></urlset>", "application/xml");
      if (url === "https://example.com/privacy-policy") {
        return new Response(trustPageHtml("개인정보처리방침"), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "googlebot: noindex" },
        });
      }
      return trustPageResponse(url) ?? new Response("not found", { status: 404 });
    });

    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com", checkedAt, expectedTerms: ["생활경제"], fetcher,
    });

    const check = result.checks.find((item) => item.key === "trust_page_indexable");
    expect(check?.passed).toBe(false);
    expect(check?.message).toContain("X-Robots-Tag");
  });

  it("fails when a linked trust page does not open", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://example.com/") return htmlResponse(homeHtml);
      if (url === "https://example.com/robots.txt") return textResponse("Sitemap: https://example.com/wp-sitemap.xml", "text/plain");
      if (url === "https://example.com/wp-sitemap.xml") return textResponse("<?xml version=\"1.0\"?><urlset></urlset>", "application/xml");
      if (url === "https://example.com/contact") return new Response("not found", { status: 404 });
      return trustPageResponse(url) ?? new Response("not found", { status: 404 });
    });

    const result = await auditWordPressSiteReadiness({
      siteUrl: "https://example.com", checkedAt, expectedTerms: ["생활경제"], fetcher,
    });

    const check = result.checks.find((item) => item.key === "trust_page_indexable");
    expect(check?.passed).toBe(false);
    expect(check?.message).toContain("문의");
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
    const trustPage = trustPageResponse(url);
    if (trustPage) return trustPage;
    return new Response("not found", { status: 404 });
  });
}

function htmlResponse(html: string): Response {
  return textResponse(html, "text/html; charset=utf-8");
}

function textResponse(body: string, contentType: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}
