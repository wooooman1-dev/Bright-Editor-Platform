import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { PlaywrightTistoryEditorAdapter, TistoryPublishingAdapter, checkTistoryEditorReady, saveTistoryDraft } from "../../apps/tistory";
import { BrowserContextManager, BrowserManager } from "../../core/automation/browser";
import type { ContentDocument } from "../../core/content";

const enabled = process.env.RUN_TISTORY_DRAFT_SAVE === "1";

describe.skipIf(!enabled)("manual Tistory draft save", () => {
  it("opens the configured editor and saves canonical content as a draft", async () => {
    const blogId = required("TISTORY_BLOG_ID");
    const storageStatePath = required("TISTORY_STORAGE_STATE_PATH");
    const contentPath = required("TISTORY_CONTENT_PATH");
    const document = JSON.parse(await readFile(contentPath, "utf8")) as ContentDocument;
    const prepared = await new TistoryPublishingAdapter().prepare({ content: document, platform: "tistory" });
    const browser = new BrowserManager({ headless: false });
    const contexts = new BrowserContextManager(browser, { storageStatePath });
    try {
      const page = await contexts.newPage();
      await checkTistoryEditorReady(page, blogId);
      expect((await saveTistoryDraft(new PlaywrightTistoryEditorAdapter(page), prepared.payload)).status).toBe("saved");
    } finally {
      await contexts.close(); await browser.close();
    }
  }, 120_000);
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
