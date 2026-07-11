import type { Locator, Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  createTistoryUrls,
  navigateToTistoryLoginEntry,
  TistoryLoginEntryNavigationError,
  TistoryLoginPage,
} from "../../../../../apps/tistory";

function createPageMock(options?: {
  gotoError?: Error;
  waitForError?: Error;
}): {
  goto: ReturnType<typeof vi.fn>;
  page: Page;
  waitFor: ReturnType<typeof vi.fn>;
} {
  const goto = options?.gotoError
    ? vi.fn().mockRejectedValue(options.gotoError)
    : vi.fn().mockResolvedValue(null);
  const waitFor = options?.waitForError
    ? vi.fn().mockRejectedValue(options.waitForError)
    : vi.fn().mockResolvedValue(undefined);
  const locator = { waitFor } as unknown as Locator;
  const page = {
    getByRole: vi.fn(() => locator),
    goto,
  } as unknown as Page;

  return { goto, page, waitFor };
}

describe("navigateToTistoryLoginEntry", () => {
  it("navigates to the generated login URL and verifies the login entry", async () => {
    const { goto, page } = createPageMock();
    const waitForLoginEntry = vi.spyOn(
      TistoryLoginPage.prototype,
      "waitForLoginEntry",
    );

    const result = await navigateToTistoryLoginEntry(page, "bright-editor");

    const loginUrl = createTistoryUrls("bright-editor").login;
    expect(goto).toHaveBeenCalledWith(loginUrl, {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });
    expect(waitForLoginEntry).toHaveBeenCalledWith(10_000);
    expect(result).toEqual({ loginUrl });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("wraps navigation failures predictably", async () => {
    const navigationError = new Error("navigation failed");
    const { page, waitFor } = createPageMock({
      gotoError: navigationError,
    });

    const promise = navigateToTistoryLoginEntry(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      cause: navigationError,
      code: "NAVIGATION_FAILED",
      message: "Unable to navigate to the Tistory login entry.",
      name: "TistoryLoginEntryNavigationError",
    });
    expect(waitFor).not.toHaveBeenCalled();
  });

  it("wraps a missing login-entry element predictably", async () => {
    const locatorError = new Error("element missing");
    const { page } = createPageMock({ waitForError: locatorError });

    const promise = navigateToTistoryLoginEntry(page, "bright-editor");

    await expect(promise).rejects.toMatchObject({
      cause: locatorError,
      code: "LOGIN_ENTRY_UNAVAILABLE",
      message: "The Tistory login entry is unavailable.",
      name: "TistoryLoginEntryNavigationError",
    });
  });

  it("wraps an invalid blog identifier predictably", async () => {
    const { page } = createPageMock();

    await expect(
      navigateToTistoryLoginEntry(page, "https://example.tistory.com"),
    ).rejects.toBeInstanceOf(TistoryLoginEntryNavigationError);

    await expect(
      navigateToTistoryLoginEntry(page, "https://example.tistory.com"),
    ).rejects.toMatchObject({ code: "INVALID_BLOG_IDENTIFIER" });
  });
});
