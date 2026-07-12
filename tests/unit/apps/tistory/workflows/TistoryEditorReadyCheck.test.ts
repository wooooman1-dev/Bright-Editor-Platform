import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  checkTistoryEditorReady,
  createTistoryUrls,
  TistoryEditorReadyCheckError,
} from "../../../../../apps/tistory";

function createPageMock(options?: {
  currentUrl?: string;
  gotoError?: Error;
  loadError?: Error;
}): {
  goto: ReturnType<typeof vi.fn>;
  page: Page;
  waitForLoadState: ReturnType<typeof vi.fn>;
} {
  const editorUrl = createTistoryUrls("bright-editor").editor;
  const goto = options?.gotoError
    ? vi.fn().mockRejectedValue(options.gotoError)
    : vi.fn().mockResolvedValue(null);
  const waitForLoadState = options?.loadError
    ? vi.fn().mockRejectedValue(options.loadError)
    : vi.fn().mockResolvedValue(undefined);
  const page = {
    goto,
    url: vi.fn(() => options?.currentUrl ?? editorUrl),
    waitForLoadState,
  } as unknown as Page;

  return { goto, page, waitForLoadState };
}

describe("checkTistoryEditorReady", () => {
  it("returns an immutable ready result after editor loading completes", async () => {
    const { goto, page, waitForLoadState } = createPageMock();

    const result = await checkTistoryEditorReady(page, "bright-editor");

    const editorUrl = createTistoryUrls("bright-editor").editor;
    expect(goto).toHaveBeenCalledWith(editorUrl, {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });
    expect(waitForLoadState).toHaveBeenCalledWith("load", {
      timeout: 10_000,
    });
    expect(result).toEqual({ editorUrl, status: "ready" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects an invalid blog identifier predictably", async () => {
    const { goto, page } = createPageMock();

    const promise = checkTistoryEditorReady(page, "invalid.example.com");

    await expect(promise).rejects.toMatchObject({
      code: "INVALID_BLOG_IDENTIFIER",
      message: "A valid Tistory blog identifier is required.",
      name: "TistoryEditorReadyCheckError",
    });
    await expect(promise).rejects.toBeInstanceOf(TistoryEditorReadyCheckError);
    expect(goto).not.toHaveBeenCalled();
  });

  it("reports an expired session when editor entry redirects to login", async () => {
    const loginUrl = createTistoryUrls("bright-editor").login;
    const { page, waitForLoadState } = createPageMock({ currentUrl: loginUrl });

    const promise = checkTistoryEditorReady(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
      message: "The Tistory session has expired.",
      name: "TistoryEditorReadyCheckError",
    });
    expect(waitForLoadState).not.toHaveBeenCalled();
  });

  it("reports an editor that does not finish loading", async () => {
    const loadError = new Error("load timeout");
    const { page } = createPageMock({ loadError });

    const promise = checkTistoryEditorReady(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      cause: loadError,
      code: "EDITOR_NOT_READY",
      message: "The Tistory editor is not ready.",
      name: "TistoryEditorReadyCheckError",
    });
  });

  it("reports an unavailable editor entry predictably", async () => {
    const navigationError = new Error("navigation failed");
    const { page } = createPageMock({
      currentUrl: "about:blank",
      gotoError: navigationError,
    });

    const promise = checkTistoryEditorReady(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      code: "EDITOR_UNAVAILABLE",
      message: "The Tistory editor is unavailable.",
      name: "TistoryEditorReadyCheckError",
    });
  });
});
