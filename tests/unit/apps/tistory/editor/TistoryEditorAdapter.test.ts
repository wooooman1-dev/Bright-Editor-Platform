import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import type {
  EditorAdapter,
  EditorButtonInput,
  EditorMediaInput,
} from "../../../../../core/editor";
import { TistoryEditorAdapter } from "../../../../../apps/tistory";

class TestTistoryEditorAdapter extends TistoryEditorAdapter {
  readonly calls: string[] = [];

  constructor(page: Page) {
    super(page);
  }

  async prepare(): Promise<void> {
    this.calls.push("prepare");
  }

  async isReady(): Promise<boolean> {
    this.calls.push("isReady");
    return true;
  }

  async setTitle(title: string): Promise<void> {
    this.calls.push(`setTitle:${title}`);
  }

  async setContent(content: string): Promise<void> {
    this.calls.push(`setContent:${content}`);
  }

  async insertImage(image: EditorMediaInput): Promise<void> {
    this.calls.push(`insertImage:${image.source}`);
  }

  async insertVideo(video: EditorMediaInput): Promise<void> {
    this.calls.push(`insertVideo:${video.source}`);
  }

  async insertButton(button: EditorButtonInput): Promise<void> {
    this.calls.push(`insertButton:${button.label}:${button.targetUrl}`);
  }

  async saveDraft(): Promise<void> {
    this.calls.push("saveDraft");
  }

  async publish(): Promise<void> {
    this.calls.push("publish");
  }
}

describe("TistoryEditorAdapter", () => {
  it("provides a Playwright-backed foundation for the editor contract", async () => {
    const page = {} as Page;
    const adapter: EditorAdapter = new TestTistoryEditorAdapter(page);

    await adapter.prepare();
    const ready = await adapter.isReady();

    expect(ready).toBe(true);
    expect(adapter).toBeInstanceOf(TistoryEditorAdapter);
    expect((adapter as TestTistoryEditorAdapter).calls).toEqual([
      "prepare",
      "isReady",
    ]);
  });

  it("defines future editor capabilities without using Playwright", async () => {
    const page = {
      click: vi.fn(),
      fill: vi.fn(),
      locator: vi.fn(),
    } as unknown as Page;
    const adapter = new TestTistoryEditorAdapter(page);

    await adapter.setTitle("Title");
    await adapter.setContent("Content");
    await adapter.insertImage({ source: "image.png" });
    await adapter.insertVideo({ source: "video.mp4" });
    await adapter.insertButton({ label: "Read", targetUrl: "https://example.com" });
    await adapter.saveDraft();
    await adapter.publish();

    expect(page.locator).not.toHaveBeenCalled();
    expect(page.fill).not.toHaveBeenCalled();
    expect(page.click).not.toHaveBeenCalled();
  });
});
