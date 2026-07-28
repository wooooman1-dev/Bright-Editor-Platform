import { describe, expect, it, vi } from "vitest";

import { auditTistorySiteReadiness } from "../../../../../apps/tistory/approval/TistorySiteReadinessAudit";

const homepage = `<!doctype html>
<html lang="ko">
<head>
  <title>비바레인 미술 감상 가이드</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="서양미술 작품을 쉽게 감상하는 비바레인 가이드">
</head>
<body>
  <nav class="menu">
    <a href="/">홈</a>
    <a href="/category/서양-회화-심층-분석">카테고리</a>
    <a href="/entry/first">첫 글</a>
    <a href="/entry/second">둘째 글</a>
    <a href="/pages/about">사이트 소개</a>
    <a href="/pages/contact">문의</a>
    <a href="/pages/privacy">개인정보 처리방침</a>
  </nav>
  <main>
    <article>${"비바레인은 미술 초보자가 작품의 색과 구도, 시대적 배경을 차례로 관찰하도록 돕습니다. ".repeat(12)}</article>
  </main>
</body>
</html>`;

function successfulFetcher(html = homepage) {
  return vi.fn(async (_input: string | URL, init?: RequestInit) => {
    if (init?.method === "HEAD") return new Response("", { status: 200 });
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

describe("TistorySiteReadinessAudit", () => {
  it("passes an observable public Tistory site with navigation, trust pages, mobile metadata, and healthy links", async () => {
    const result = await auditTistorySiteReadiness({
      blogUrl: "https://viva-rain.tistory.com",
      checkedAt: "2026-07-27T10:00:00.000Z",
      expectedTerms: ["비바레인", "미술"],
      fetcher: successfulFetcher(),
    });

    expect(result.status).toBe("passed");
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "privacy", passed: true }));
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "about_contact", passed: true, requirement: "recommended" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "broken_links", passed: true }));
  });

  it("passes required site readiness when only the recommended about and contact page is missing", async () => {
    const html = homepage
      .replace(/<a href="\/pages\/about">[\s\S]*?<\/a>/, "")
      .replace(/<a href="\/pages\/contact">[\s\S]*?<\/a>/, "");

    const result = await auditTistorySiteReadiness({
      blogUrl: "https://viva-rain.tistory.com",
      checkedAt: "2026-07-27T10:00:00.000Z",
      expectedTerms: ["비바레인"],
      fetcher: successfulFetcher(html),
    });

    expect(result.status).toBe("passed");
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "privacy", passed: true }));
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "about_contact",
      passed: false,
      requirement: "recommended",
    }));
  });

  it("keeps the site in review when the required privacy policy is not observable", async () => {
    const html = homepage.replace(/<a href="\/pages\/privacy">[\s\S]*?<\/a>/, "");

    const result = await auditTistorySiteReadiness({
      blogUrl: "https://viva-rain.tistory.com",
      checkedAt: "2026-07-27T10:00:00.000Z",
      expectedTerms: ["비바레인"],
      fetcher: successfulFetcher(html),
    });

    expect(result.status).toBe("needs_review");
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "privacy", passed: false }));
  });

  it("blocks readiness when the public site cannot be reached", async () => {
    const result = await auditTistorySiteReadiness({
      blogUrl: "https://viva-rain.tistory.com",
      checkedAt: "2026-07-27T10:00:00.000Z",
      expectedTerms: ["비바레인"],
      fetcher: vi.fn(async () => { throw new Error("network unavailable"); }),
    });

    expect(result.status).toBe("blocked");
    expect(result.checks[0]).toMatchObject({ key: "public_access", passed: false });
  });
});
