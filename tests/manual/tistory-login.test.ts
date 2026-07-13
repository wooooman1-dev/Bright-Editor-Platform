import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import { createTistoryUrls } from "../../apps/tistory";

const enabled = process.env.RUN_TISTORY_LOGIN === "1";

describe.skipIf(!enabled)("Tistory manual session setup", () => {
  it("saves storage state only after manual authentication", async () => {
    const blogId = required("TISTORY_BLOG_ID");
    const storagePath = resolve(process.env.TISTORY_STORAGE_STATE_PATH ?? ".bright-studio/tistory/storage-state.json");
    const urls = createTistoryUrls(blogId);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(urls.editor, { waitUntil: "domcontentloaded", timeout: 30_000 });
      process.stdout.write("Complete Kakao/Tistory login in the opened browser. Waiting for authenticated editor access...\n");
      await page.waitForURL((url) => url.hostname.startsWith(blogId) && !url.pathname.includes("login"), { timeout: 300_000 });
      expect(page.url()).not.toContain("login");
      await mkdir(dirname(storagePath), { recursive: true });
      await context.storageState({ path: storagePath });
      process.stdout.write(`Authenticated session verified. Storage state saved: ${storagePath}\n`);
    } finally {
      await context.close(); await browser.close();
    }
  }, 360_000);
});

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required; the target blog identifier will not be guessed.`);
  return value.trim();
}
