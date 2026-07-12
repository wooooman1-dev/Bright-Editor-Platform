import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  createTistoryUrls,
  navigateToTistoryEditorEntry,
  TistoryEditorEntryNavigationError,
} from "../../../../../apps/tistory";

function createPageMock(options?: {
  currentUrl?: string;
  gotoError?: Error;
}): {
  goto: ReturnType<typeof vi.fn>;
  page: Page;
} {
  const goto = options?.gotoError
    ? vi.fn().mockRejectedValue(options.gotoError)
    : vi.fn().mockResolvedValue(null);
  const page = {
    goto,
    url: vi.fn(() => options?.currentUrl ?? createTistoryUrls("bright-editor").editor),
  } as unknown as Page;

  return { goto, page };
}

describe("navigateToTistoryEditorEntry", () => {
  it("navigates to the generated editor URL with a finite timeout", async () => {
    const { goto, page } = createPageMock();

    const result = await navigateToTistoryEditorEntry(page, "bright-editor");

    const editorUrl = createTistoryUrls("bright-editor").editor;
    expect(goto).toHaveBeenCalledWith(editorUrl, {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });
    expect(result).toEqual({ editorUrl });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("wraps an invalid blog identifier predictably", async () => {
    const { goto, page } = createPageMock();

    const promise = navigateToTistoryEditorEntry(
      page,
      "https://example.tistory.com",
    );

    await expect(promise).rejects.toMatchObject({
      code: "INVALID_BLOG_IDENTIFIER",
      message: "A valid Tistory blog identifier is required.",
      name: "TistoryEditorEntryNavigationError",
    });
    await expect(promise).rejects.toBeInstanceOf(
      TistoryEditorEntryNavigationError,
    );
    expect(goto).not.toHaveBeenCalled();
  });

  it("wraps navigation failures predictably", async () => {
    const navigationError = new Error("navigation failed");
    const { page } = createPageMock({ gotoError: navigationError });

    const promise = navigateToTistoryEditorEntry(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      cause: navigationError,
      code: "NAVIGATION_FAILED",
      message: "Unable to navigate to the Tistory editor entry.",
      name: "TistoryEditorEntryNavigationError",
    });
  });

  it("rejects navigation that does not reach the editor URL", async () => {
    const { page } = createPageMock({
      currentUrl: createTistoryUrls("bright-editor").login,
    });

    const promise = navigateToTistoryEditorEntry(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      code: "EDITOR_ENTRY_UNAVAILABLE",
      message: "The Tistory editor entry is unavailable.",
      name: "TistoryEditorEntryNavigationError",
    });
  });
});
