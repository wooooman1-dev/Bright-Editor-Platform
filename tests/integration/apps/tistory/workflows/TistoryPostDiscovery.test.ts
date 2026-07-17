import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { extractPublicPostRows, publicPostListingUrls } from "../../../../../apps/tistory/workflows/TistoryPostDiscovery.mjs";

const origin = "https://bright-healthy.tistory.com";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
});

describe("Tistory public post discovery", () => {
  it("uses the category listing before the skin-dependent home listing", () => {
    expect(publicPostListingUrls(origin, 2)).toEqual([
      `${origin}/category?page=2`,
      `${origin}/?page=2`,
    ]);
  });

  it("extracts titles from link text and image alt while excluding other origins", async () => {
    await page.setContent(`
      <main>
        <article>
          <a href="${origin}/entry/gut-brain-axis">장-뇌 축과 정신 건강</a>
          <a href="${origin}/category/health">건강정보</a>
          <p class="summary">장과 뇌가 연결되는 원리를 설명합니다.</p>
          <time datetime="2026-07-17">2026. 7. 17.</time>
        </article>
        <li>
          <a href="${origin}/entry/blood-sugar"><img alt="식후 혈당 관리 방법" /></a>
        </li>
        <a href="https://other.tistory.com/entry/external">다른 블로그 글</a>
        <a href="${origin}/manage/posts">관리 페이지</a>
      </main>
    `);

    const rows = await extractPublicPostRows(page, origin);

    expect(rows).toEqual([
      {
        title: "장-뇌 축과 정신 건강",
        publishedUrl: `${origin}/entry/gut-brain-axis`,
        categoryName: "건강정보",
        publishedAt: "2026-07-17",
        excerpt: "장과 뇌가 연결되는 원리를 설명합니다.",
      },
      {
        title: "식후 혈당 관리 방법",
        publishedUrl: `${origin}/entry/blood-sugar`,
        categoryName: undefined,
        publishedAt: undefined,
        excerpt: "",
      },
    ]);
  });
});
