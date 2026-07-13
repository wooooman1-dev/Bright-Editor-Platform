import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

describe.skipIf(process.env.RUN_PLATFORM_CONNECTIONS_UI !== "1")("Platform Connections UI", () => {
  it("uses user-facing fields and safe validation without terminal configuration", async () => {
    const browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); page.setDefaultTimeout(5_000);
    try {
      await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
      await page.locator("#workspace-name").fill("Connection Verification Workspace");
      await page.locator('button[type="submit"]').click();
      await page.getByRole("link", { name: "설정", exact: true }).click();
      await page.getByRole("button", { name: "플랫폼 연결" }).click();
      await page.getByLabel("블로그 주소").fill("https://example.com");
      await page.getByRole("button", { name: "계정 연결", exact: true }).click();
      await page.getByText("Enter a valid Tistory blog address.").waitFor();
      await page.getByLabel("사이트 주소").fill("not-a-url");
      await page.getByLabel("사용자 이름").fill("editor");
      await page.getByLabel("Application Password").fill("temporary-secret");
      await page.getByRole("button", { name: "연결 테스트" }).click();
      await page.getByText("Enter a valid WordPress site address.").waitFor();
      expect(await page.getByText(/storage-state|Playwright|REST endpoint|secretReference/i).count()).toBe(0);
      expect(await page.getByLabel("Application Password").getAttribute("type")).toBe("password");
    } finally { await browser.close(); }
  }, 30_000);
});
